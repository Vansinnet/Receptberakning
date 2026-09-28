import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Skriver till en temporär fil och byter namn, så att en avbruten körning aldrig lämnar en halv fil. */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, path);
}

export async function readJsonIfExists<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * JSON med en post per rad: kompakt men med läsbara diffar i git. För ett objekt skrivs
 * nycklarna i `lineKeys` (listor eller objekt) med en post per rad, övriga på en rad.
 */
export function jsonLines(value: unknown[] | Record<string, unknown>, lineKeys: readonly string[] = []): string {
  if (Array.isArray(value)) return `[\n${value.map((v) => JSON.stringify(v)).join(',\n')}\n]\n`;
  const entries = Object.entries(value).map(([k, v]) => {
    const key = JSON.stringify(k);
    if (lineKeys.includes(k) && Array.isArray(v)) return `${key}: [\n${v.map((x) => `  ${JSON.stringify(x)}`).join(',\n')}\n]`;
    if (lineKeys.includes(k) && v && typeof v === 'object') {
      return `${key}: {\n${Object.entries(v).map(([k2, v2]) => `  ${JSON.stringify(k2)}: ${JSON.stringify(v2)}`).join(',\n')}\n}`;
    }
    return `${key}: ${JSON.stringify(v)}`;
  });
  return `{\n${entries.join(',\n')}\n}\n`;
}
