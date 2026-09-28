// Hämtar alla humanläkemedel från fass.se: sitemap → varje produktsida → Product.

import type { HttpClient } from '../lib/http.ts';
import { HttpError } from '../lib/http.ts';
import { log, progress } from '../lib/log.ts';
import { parseProductPage, parseSitemap } from './page.ts';
import { toProduct, type Product } from './products.ts';

export const FASS_SITEMAP_URL = 'https://fass.se/sitemap-health-product.xml';
export const fassProductUrl = (nplId: string) => `https://fass.se/health/product/${nplId}`;

export interface FassCrawlResult {
  products: Product[];
  stats: {
    inSitemap: number;
    /** Sidor som hämtades men saknade produktdata (t.ex. borttagna produkter). */
    noData: number;
    /** Produkter som inte kan användas: ej marknadsförda, saknar ATC-kod eller namn. */
    skipped: number;
    /** Sidor som inte gick att hämta trots omförsök. */
    failed: number;
  };
}

export interface FassCrawlOptions {
  /** Begränsa antalet produkter (för provkörningar). */
  limit?: number;
  /** Högsta andel sidor som får misslyckas innan körningen avbryts. */
  maxFailureRate?: number;
  /** Högsta andel sidor utan produktdata innan körningen avbryts. */
  maxNoDataRate?: number;
}

export async function crawlFass(http: HttpClient, opts: FassCrawlOptions = {}): Promise<FassCrawlResult> {
  const { limit, maxFailureRate = 0.02, maxNoDataRate = 0.05 } = opts;
  const all = parseSitemap(await http.getText(FASS_SITEMAP_URL));
  if (all.length === 0) throw new Error('FASS sitemap innehöll inga produkter — har formatet ändrats?');
  const ids = limit ? all.slice(0, limit) : all;
  log.info(`FASS sitemap: ${all.length} produkter${limit ? `, hämtar ${ids.length}` : ''}`);

  const stats = { inSitemap: all.length, noData: 0, skipped: 0, failed: 0 };
  const products: Product[] = [];
  const tick = progress('FASS produktsidor', ids.length);

  await Promise.all(ids.map(async (nplId) => {
    try {
      const header = parseProductPage(await http.getText(fassProductUrl(nplId)));
      if (!header) stats.noData++;
      else {
        const product = toProduct(header, nplId);
        if (product) products.push(product); else stats.skipped++;
      }
    } catch (e) {
      // 404/410: produkten har försvunnit mellan sitemap och hämtning — inget fel.
      if (e instanceof HttpError && (e.status === 404 || e.status === 410)) stats.noData++;
      else {
        stats.failed++;
        log.warn(`FASS ${nplId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      tick();
    }
  }));

  const failureRate = stats.failed / ids.length;
  if (failureRate > maxFailureRate) {
    throw new Error(`${stats.failed} av ${ids.length} FASS-sidor kunde inte hämtas (${(failureRate * 100).toFixed(1)} %) — avbryter`);
  }
  // Sidor utan produktdata är normalt få (avregistrerade produkter). Blir de många har
  // FASS troligen ändrat sidformatet, och då ska körningen stoppas i stället för att ge
  // en lista där läkemedel tyst saknas.
  const noDataShare = stats.noData / Math.max(1, ids.length - stats.failed);
  if (ids.length >= 50 && noDataShare > maxNoDataRate) {
    throw new Error(`${stats.noData} av ${ids.length} FASS-sidor saknade produktdata (${(noDataShare * 100).toFixed(1)} %) — har sidformatet ändrats?`);
  }
  products.sort((a, b) => (a.nplId < b.nplId ? -1 : 1));
  return { products, stats };
}
