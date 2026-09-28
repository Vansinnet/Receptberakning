// Artig HTTP-klient för datahämtningen.
//
// Tre saker skyddar källorna (fass.se, janusmed.se) och gör körningen stabil:
//   1. Hastighetsgräns: token bucket, högst `rps` anrop per sekund i genomsnitt.
//   2. Samtidighet: högst `concurrency` anrop pågår samtidigt.
//   3. Omförsök: nätverksfel, 408/425/429 och 5xx försöks igen med exponentiell
//      väntan och slumpvis spridning ("full jitter"). Retry-After respekteras.
// Klienten identifierar sig ärligt med User-Agent och kontaktadress.

export interface HttpClientOptions {
  /** Högsta genomsnittliga antal anrop per sekund. */
  rps: number;
  /** Högsta antal samtidiga anrop. */
  concurrency: number;
  /** Antal omförsök efter första försöket. */
  retries?: number;
  /** Tidsgräns per försök i millisekunder. */
  timeoutMs?: number;
  /** Bas för exponentiell väntan i millisekunder. */
  backoffBaseMs?: number;
  /** Tak för en enskild väntan (även Retry-After) i millisekunder. */
  backoffMaxMs?: number;
  userAgent?: string;
  /** HTTP-statusar som försöks igen. Standard: 408, 425, 429, 500, 502, 503, 504. */
  retryStatuses?: readonly number[];
  /** Injiceras i tester. */
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export interface HttpStats {
  requests: number;
  retries: number;
  failures: number;
  bytes: number;
}

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(url: string, status: number) {
    super(`HTTP ${status} för ${url.length > 120 ? `${url.slice(0, 117)}…` : url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export const DEFAULT_USER_AGENT =
  'Receptberakning-datauppdatering/5 (+https://github.com/Vansinnet/receptberakning; manadsvis uppdatering)';

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retry-After kan vara sekunder eller ett HTTP-datum. Returnerar millisekunder eller null. */
export function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** Väntetid före försök nummer `attempt` (1 = första omförsöket), full jitter. */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number, random: () => number): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  return Math.round(random() * ceiling);
}

export interface HttpClient {
  getText(url: string, init?: { headers?: Record<string, string> }): Promise<string>;
  readonly stats: Readonly<HttpStats>;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const {
    rps, concurrency,
    retries = 4,
    timeoutMs = 60_000,
    backoffBaseMs = 1_000,
    backoffMaxMs = 60_000,
    userAgent = DEFAULT_USER_AGENT,
  } = options;
  const retryStatuses = new Set(options.retryStatuses ?? DEFAULT_RETRY_STATUSES);
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  if (!(rps > 0) || !(concurrency >= 1)) throw new Error('rps och concurrency måste vara positiva');

  const stats: HttpStats = { requests: 0, retries: 0, failures: 0, bytes: 0 };

  // ── Samtidighet: enkel semafor med FIFO-kö ─────────────────────────────────
  let active = 0;
  const waiting: (() => void)[] = [];
  async function acquire(): Promise<void> {
    if (active < concurrency) { active++; return; }
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  function release(): void {
    const next = waiting.shift();
    if (next) next(); else active--;
  }

  // ── Hastighetsgräns: token bucket med kapacitet 1 (jämn takt, inga skurar) ──
  const interval = 1000 / rps;
  let nextSlot = 0;
  async function takeToken(): Promise<void> {
    const t = now();
    const slot = Math.max(t, nextSlot);
    nextSlot = slot + interval;
    if (slot > t) await sleep(slot - t);
  }
  /** Efter 429/503 med Retry-After pausas hela klienten, inte bara anropet. */
  function pauseAll(ms: number): void {
    nextSlot = Math.max(nextSlot, now() + ms);
  }

  async function attempt(url: string, headers: Record<string, string>): Promise<string> {
    await takeToken();
    stats.requests++;
    const res = await doFetch(url, {
      headers: { 'user-agent': userAgent, 'accept-language': 'sv', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) {
      const err = new HttpError(url, res.status);
      const wait = parseRetryAfter(res.headers.get('retry-after'), now());
      if (wait !== null) pauseAll(Math.min(wait, backoffMaxMs));
      // Läs klart kroppen så att anslutningen kan återanvändas.
      await res.arrayBuffer().catch(() => undefined);
      throw err;
    }
    const text = await res.text();
    stats.bytes += text.length;
    return text;
  }

  function isRetryable(err: unknown): boolean {
    if (err instanceof HttpError) return retryStatuses.has(err.status);
    return true; // nätverksfel, tidsgräns, avbruten anslutning
  }

  async function getText(url: string, init: { headers?: Record<string, string> } = {}): Promise<string> {
    await acquire();
    try {
      for (let n = 0; ; n++) {
        try {
          return await attempt(url, init.headers ?? {});
        } catch (err) {
          if (n >= retries || !isRetryable(err)) { stats.failures++; throw err; }
          stats.retries++;
          await sleep(backoffDelay(n + 1, backoffBaseMs, backoffMaxMs, random));
        }
      }
    } finally {
      release();
    }
  }

  return { getText, stats };
}
