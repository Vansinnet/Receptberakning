// Tolkning av FASS produktsidor och sitemap.
//
// fass.se är byggd med Next.js. Produktdatan finns inte som HTML utan i sidans
// React Server Components-data ("flight"), som skickas i bitar:
// self.__next_f.push([1,"..."]). Bitarna sätts ihop i ordning och tolkas som rader:
//   <id>:<json>\n            vanlig rad
//   <id>:T<hexlängd>,<text>   textrad, exakt så många UTF-8-byte, utan radbrytning efter
//   <id>:I[...]\n / HL[...]  moduler och resurser (används inte här)
// Ett värde kan vara en referens till en annan rad: "$2a:props:children:0:props:data".
// FASS skickar produkthuvudet ibland direkt och ibland som en sådan referens.

const NPL_ID = /^\d{14}$/;

/** Alla NPL-id i FASS sitemap för produkter, unika och sorterade. */
export function parseSitemap(xml: string): string[] {
  const ids = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*https:\/\/(?:www\.)?fass\.se\/(?:health\/)?product\/(\d+)\s*<\/loc>/g)) {
    if (NPL_ID.test(m[1])) ids.add(m[1]);
  }
  return [...ids].sort();
}

/** Sätter ihop sidans React Server Components-data till en sträng. */
export function extractFlightData(html: string): string {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    out += JSON.parse(m[1]) as string;
  }
  return out;
}

/** Tolkar flight-datan till rader (id → värde). Rader som inte är JSON hoppas över. */
export function parseFlightRows(flight: string): Map<string, unknown> {
  const buf = Buffer.from(flight, 'utf8');
  const rows = new Map<string, unknown>();
  const COLON = 0x3a, NEWLINE = 0x0a, COMMA = 0x2c;
  let pos = 0;
  while (pos < buf.length) {
    const colon = buf.indexOf(COLON, pos);
    if (colon < 0) break;
    const id = buf.toString('utf8', pos, colon);
    if (!/^[0-9a-f]+$/.test(id)) {
      // Ur takt (bör inte hända): hoppa till nästa rad.
      const nl = buf.indexOf(NEWLINE, pos);
      if (nl < 0) break;
      pos = nl + 1;
      continue;
    }
    if (buf[colon + 1] === 0x54 /* T */) {
      const comma = buf.indexOf(COMMA, colon);
      const len = parseInt(buf.toString('utf8', colon + 2, comma), 16);
      rows.set(id, buf.toString('utf8', comma + 1, comma + 1 + len));
      pos = comma + 1 + len;
      continue;
    }
    let end = buf.indexOf(NEWLINE, colon);
    if (end < 0) end = buf.length;
    const body = buf.toString('utf8', colon + 1, end);
    if (/^[[{"\d\-tfn]/.test(body)) {
      try { rows.set(id, JSON.parse(body)); } catch { /* ofullständig rad */ }
    }
    pos = end + 1;
  }
  return rows;
}

/** Följer en referens som "$2a:props:children:0:props:data" till värdet den pekar på. */
export function resolveFlightRef(ref: string, rows: Map<string, unknown>): unknown {
  const m = /^\$([0-9a-f]+)((?::[^:]+)*)$/.exec(ref);
  if (!m || !rows.has(m[1])) return undefined;
  let cur: unknown = rows.get(m[1]);
  for (const seg of m[2].split(':').filter(Boolean)) {
    if (Array.isArray(cur) && cur[0] === '$' && seg === 'props') cur = cur[3]; // React-element: ["$", typ, nyckel, props]
    else if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[seg];
    else return undefined;
  }
  return cur;
}

/** Djupsökning efter första objektet som har nyckeln `key`. */
function findWithKey(node: unknown, key: string, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== 'object' || depth > 40) return null;
  if (!Array.isArray(node) && key in node) return node as Record<string, unknown>;
  for (const child of Array.isArray(node) ? node : Object.values(node)) {
    const found = findWithKey(child, key, depth + 1);
    if (found) return found;
  }
  return null;
}

// ── Typer för de delar av FASS-datan som används ────────────────────────────

export interface FassPackage {
  nplPackId?: string | null;
  quantity?: number | null;
  container?: string | null;
  itemNumber?: string | null;
  isOnTheMarket?: boolean | null;
  parallelDistributingOrganizationName?: string | null;
}

export interface FassProductHeader {
  productInformation?: {
    nplId?: string | null;
    tradeName?: string | null;
    atcCode?: string | null;
    doseForm?: string | null;
    strength?: string | null;
    narcoticClassEnum?: string | null;
    applicableFor?: string | null;
  } | null;
  packages?: FassPackage[] | null;
}

/** Produkthuvudet ur en FASS produktsida, eller null om sidan saknar produktdata. */
export function parseProductPage(html: string): FassProductHeader | null {
  const rows = parseFlightRows(extractFlightData(html));
  for (const value of rows.values()) {
    const holder = findWithKey(value, 'productHeader');
    if (!holder) continue;
    let header = holder.productHeader;
    if (typeof header === 'string') header = resolveFlightRef(header, rows);
    if (header && typeof header === 'object' && 'productInformation' in header) return header as FassProductHeader;
  }
  return null;
}
