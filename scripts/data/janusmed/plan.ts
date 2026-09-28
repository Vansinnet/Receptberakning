// Planering av anrop så att varje par av läkemedel kontrolleras minst en gång
// med så få anrop som möjligt.
//
// En Janusmed-sida med n produkter visar interaktionerna mellan alla n·(n−1)/2 par.
// Listan delas i block om högst `blockSize`; ett anrop per blockpar (i, j), i < j,
// täcker då alla par — både inom och mellan block. Med ~1 400 profiler och
// blockstorlek 75 blir det 171 anrop, jämfört med ~950 000 parvisa anrop.

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!(size >= 1)) throw new Error('size måste vara minst 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Anropen (listor av element) som tillsammans täcker alla par av element. */
export function planPairCoverage<T>(items: readonly T[], blockSize: number): T[][] {
  const blocks = chunk(items, blockSize);
  if (blocks.length <= 1) return blocks.filter((b) => b.length >= 2);
  const requests: T[][] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) requests.push([...blocks[i], ...blocks[j]]);
  }
  return requests;
}

/** Deterministisk pseudoslump (mulberry32) för reproducerbara stickprov. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sample<T>(items: readonly T[], n: number, random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
