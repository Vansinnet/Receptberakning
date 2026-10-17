<script lang="ts">
  // Uttagen i datumordning med takten till nästa uttag. Samma tabell på skärmen och i utskriften.
  import type { LongtermResult } from '$lib/domain/longterm';
  import { ltFillText, ltRate, ltRateUnit } from '$lib/domain/texts';
  import type { LtInterval } from '$lib/types';
  import { fmtDate, fmtMg, fmtPct } from '$lib/utils';

  let { r, noun, interval, cls = 'table' }: {
    r: Extract<LongtermResult, { kind: 'ok' }>;
    noun: string;
    interval: LtInterval;
    /** Tabellens klass: "table" på skärmen, "ltp-table" i utskriften. */
    cls?: string;
  } = $props();

  let mg = $derived(r.unit === 'mg');
  let unitLabel = $derived(ltRateUnit(r.unit, noun, interval));
</script>

<table class={cls}>
  <caption class="sr-only">Uttagen i datumordning med {unitLabel} till nästa uttag</caption>
  <thead>
    <tr>
      <th scope="col">Datum</th>
      <th scope="col">Uttaget</th>
      {#if mg}<th scope="col" class="num">mg</th>{/if}
      <th scope="col" class="num">Dagar till nästa</th>
      <th scope="col" class="num">{unitLabel}</th>
      {#if r.maxDose}<th scope="col" class="num">Av maxdos</th>{/if}
    </tr>
  </thead>
  <tbody>
    {#each r.fills as f (f.date.getTime())}
      <tr>
        <td class="nowrap">{fmtDate(f.date)}</td>
        <td>{ltFillText(f, noun)}</td>
        {#if mg}<td class="num">{fmtMg(f.amount)}</td>{/if}
        <td class="num">{f.last ? `${f.days} till idag` : f.days}</td>
        <td class="num">{f.rate === null ? '–' : ltRate(f.rate, interval)}</td>
        {#if r.maxDose}<td class="num">{f.pct === null ? '–' : fmtPct(f.pct)}</td>{/if}
      </tr>
    {/each}
  </tbody>
</table>
