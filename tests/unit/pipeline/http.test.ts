// HTTP-klienten i datakedjan: hastighetsgräns, samtidighet, omförsök och Retry-After.
// Klockan och väntan är simulerade, så testerna är snabba och deterministiska.
import { describe, it, expect, vi } from 'vitest';
import { backoffDelay, createHttpClient, HttpError, parseRetryAfter } from '../../../scripts/data/lib/http';

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => { t += ms; },
  };
}

const ok = (body = 'ok') => new Response(body, { status: 200 });

describe('parseRetryAfter', () => {
  it('sekunder', () => expect(parseRetryAfter('30', 0)).toBe(30_000));
  it('HTTP-datum', () => expect(parseRetryAfter('Thu, 01 Jan 1970 00:01:00 GMT', 0)).toBe(60_000));
  it('saknas eller ogiltig', () => {
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter('snart', 0)).toBeNull();
  });
});

describe('backoffDelay', () => {
  it('växer exponentiellt och har ett tak', () => {
    const max = () => 1;
    expect(backoffDelay(1, 1000, 60_000, max)).toBe(1000);
    expect(backoffDelay(3, 1000, 60_000, max)).toBe(4000);
    expect(backoffDelay(20, 1000, 60_000, max)).toBe(60_000);
  });
  it('full jitter: mellan 0 och taket', () => {
    expect(backoffDelay(3, 1000, 60_000, () => 0)).toBe(0);
    expect(backoffDelay(3, 1000, 60_000, () => 0.5)).toBe(2000);
  });
});

describe('createHttpClient', () => {
  it('håller hastighetsgränsen: 2 per sekund ger 500 ms mellan anropen', async () => {
    vi.useFakeTimers({ now: 0 });
    try {
      const starts: number[] = [];
      const http = createHttpClient({
        rps: 2, concurrency: 10,
        fetch: async () => { starts.push(Date.now()); return ok(); },
      });
      const all = Promise.all([1, 2, 3, 4].map((i) => http.getText(`https://x/${i}`)));
      await vi.runAllTimersAsync();
      await all;
      expect(starts).toEqual([0, 500, 1000, 1500]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('håller samtidighetsgränsen', async () => {
    let active = 0, peak = 0;
    const http = createHttpClient({
      rps: 1000, concurrency: 3,
      fetch: async () => {
        active++; peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return ok();
      },
    });
    await Promise.all(Array.from({ length: 12 }, (_, i) => http.getText(`https://x/${i}`)));
    expect(peak).toBe(3);
  });

  it('försöker igen vid 503 och respekterar Retry-After', async () => {
    const clock = fakeClock();
    const calls: number[] = [];
    const http = createHttpClient({
      rps: 100, concurrency: 1, random: () => 0, ...clock,
      fetch: async () => {
        calls.push(clock.now());
        return calls.length === 1 ? new Response('', { status: 503, headers: { 'retry-after': '7' } }) : ok('svar');
      },
    });
    expect(await http.getText('https://x/')).toBe('svar');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBeGreaterThanOrEqual(7000);
    expect(http.stats).toMatchObject({ requests: 2, retries: 1, failures: 0 });
  });

  it('försöker igen vid nätverksfel', async () => {
    let n = 0;
    const http = createHttpClient({
      rps: 100, concurrency: 1, ...fakeClock(),
      fetch: async () => { if (++n < 3) throw new TypeError('fetch failed'); return ok(); },
    });
    await expect(http.getText('https://x/')).resolves.toBe('ok');
    expect(n).toBe(3);
  });

  it('försöker inte igen vid 404', async () => {
    let n = 0;
    const http = createHttpClient({
      rps: 100, concurrency: 1, ...fakeClock(),
      fetch: async () => { n++; return new Response('', { status: 404 }); },
    });
    await expect(http.getText('https://x/')).rejects.toMatchObject({ name: 'HttpError', status: 404 });
    expect(n).toBe(1);
  });

  it('ger upp efter angivet antal omförsök', async () => {
    let n = 0;
    const http = createHttpClient({
      rps: 100, concurrency: 1, retries: 2, ...fakeClock(),
      fetch: async () => { n++; return new Response('', { status: 500 }); },
    });
    await expect(http.getText('https://x/')).rejects.toBeInstanceOf(HttpError);
    expect(n).toBe(3);
    expect(http.stats.failures).toBe(1);
  });

  it('identifierar sig med en ärlig User-Agent', async () => {
    let ua = '';
    const http = createHttpClient({
      rps: 100, concurrency: 1,
      fetch: async (_url, init) => { ua = new Headers(init?.headers).get('user-agent') ?? ''; return ok(); },
    });
    await http.getText('https://x/');
    expect(ua).toMatch(/^Receptberakning-datauppdatering\/.*github\.com/);
  });
});
