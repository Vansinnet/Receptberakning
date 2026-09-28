// Loggning som fungerar både i terminalen och i GitHub Actions.
// I Actions blir varningar och fel annoteringar som syns direkt i körningens sammanfattning.

const inActions = process.env.GITHUB_ACTIONS === 'true';

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export const log = {
  info(msg: string): void {
    console.log(`${stamp()} ${msg}`);
  },
  warn(msg: string): void {
    console.log(inActions ? `::warning::${msg}` : `${stamp()} VARNING: ${msg}`);
  },
  error(msg: string): void {
    console.error(inActions ? `::error::${msg}` : `${stamp()} FEL: ${msg}`);
  },
  group<T>(title: string, fn: () => Promise<T>): Promise<T> {
    if (inActions) console.log(`::group::${title}`);
    else console.log(`\n${stamp()} ── ${title} ──`);
    return fn().finally(() => { if (inActions) console.log('::endgroup::'); });
  },
};

/** Loggar förlopp var tionde procent, radvis (läsbart i Actions-loggar). */
export function progress(label: string, total: number): () => void {
  let done = 0;
  let nextReport = 10;
  const started = Date.now();
  return () => {
    done++;
    const pct = total === 0 ? 100 : Math.floor((done / total) * 100);
    if (pct >= nextReport || done === total) {
      const secs = Math.round((Date.now() - started) / 1000);
      log.info(`${label}: ${done}/${total} (${pct} %) efter ${secs} s`);
      nextReport = Math.floor(pct / 10) * 10 + 10;
    }
  };
}
