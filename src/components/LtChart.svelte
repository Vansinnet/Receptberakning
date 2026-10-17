<script lang="ts">
  // Takten mellan uttagen över tid, på skärmen och i utskriften. Tidsskalad: varje stapel börjar vid
  // uttaget och är lika bred som tiden till nästa uttag, så att uppehåll och täta uttag syns.
  // Sista uttaget visas fram till idag ("om slut idag") med ljusare stapel. Maxdosen är en streckad
  // linje. En neutral färg: diagrammet tolkar inte.
  import type { LongtermResult } from '$lib/domain/longterm';
  import { ltRate, ltRateUnit } from '$lib/domain/texts';
  import type { LtInterval } from '$lib/types';
  import { addDays, fmtDate, fmtMg, getDaysDiff } from '$lib/utils';

  let { r, noun, interval, today }: {
    r: Extract<LongtermResult, { kind: 'ok' }>;
    noun: string;
    interval: LtInterval;
    today: Date;
  } = $props();

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  // Mått i SVG-enheter. Bredden följer behållaren (minst 320), så att texten behåller sin storlek
  // på smal skärm; i utskriften, där behållaren inte mäts, är den 720 och skalas till sidan.
  const H = 236, X0 = 52, Y0 = 18, Y1 = 184;
  let measured = $state(0);
  let W = $derived(measured > 0 ? Math.max(320, Math.round(measured)) : 720);
  let X1 = $derived(W - 12);

  /** Jämna steg på y-axeln: 1, 2, 2,5 eller 5 × 10^n, med ungefär fyra steg. */
  function niceStep(max: number): number {
    const raw = max / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    return ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  }

  let unitLabel = $derived(ltRateUnit(r.unit, noun, interval));

  let chart = $derived.by(() => {
    const first = r.first;
    const span = Math.max(1, getDaysDiff(today, first));
    const x = (d: Date) => X0 + (getDaysDiff(d, first) / span) * (X1 - X0);
    const values = r.fills.filter((f) => f.rate !== null).map((f) => f.rate! * interval);
    const maxDoses = (r.maxDose ?? []).map((s) => s.dose);
    const top = Math.max(...values, ...maxDoses, 0);
    const step = top > 0 ? niceStep(top * 1.1) : 1;
    const yMax = Math.max(step, Math.ceil((top * 1.1) / step) * step);
    const y = (v: number) => Y1 - (v / yMax) * (Y1 - Y0);
    const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);

    const bars = r.fills.filter((f) => f.rate !== null).map((f) => {
      const left = x(f.date);
      const full = x(addDays(f.date, f.days)) - left;
      const gap = full > 6 ? 1 : 0;
      const v = f.rate! * interval;
      return {
        key: f.date.getTime(), x: left + gap, w: Math.max(1.5, full - gap * 2), cx: left + full / 2,
        y: y(v), h: Y1 - y(v), label: ltRate(f.rate!, interval), last: f.last,
      };
    });

    // Maxdosen som trappa: varje del från sitt datum (tidigast första uttaget) till nästa ändring.
    const segs = r.maxDose ?? [];
    const maxLines = segs.map((s, k) => {
      const from = s.from && s.from > first ? s.from : first;
      const next = segs[k + 1]?.from;
      const to = next && next < today ? next : today;
      return { key: k, x1: x(from), x2: x(to), y: y(s.dose), show: to > from };
    }).filter((l) => l.show);

    // Månadsmarkeringar, minst 34 enheter isär: glesare ju längre tid och ju smalare graf.
    const perMonth = ((X1 - X0) / span) * 30.44;
    const step2 = [1, 2, 3, 6, 12].find((s) => perMonth * s >= 34) ?? 12;
    const months: { x: number; label: string; year: string }[] = [];
    let t = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    while (t <= today) {
      const m = t.getUTCMonth();
      if (m % step2 === 0) months.push({ x: x(t), label: MONTHS[m], year: m === 0 || months.length === 0 ? String(t.getUTCFullYear()) : '' });
      t = new Date(Date.UTC(t.getUTCFullYear(), m + 1, 1));
    }
    return { bars, maxLines, ticks, y, months, yMax };
  });

  let ariaLabel = $derived([
    `${unitLabel} mellan uttagen`,
    ...r.fills.map((f) => `${fmtDate(f.date)}${f.last ? ' till idag' : ''}: ${f.rate === null ? 'ingen takt' : ltRate(f.rate, interval)}`),
    ...(r.maxDose ? [`maxdos ${r.maxDose.map((s) => ltRate(s.dose / interval, interval)).join(', ')}`] : []),
  ].join('; '));
</script>

<figure class="ltc" bind:clientWidth={measured}>
  <svg class="ltc-svg" viewBox="0 0 {W} {H}" role="img" aria-label={ariaLabel}>
    {#each chart.ticks as v (v)}
      <line class="ltc-grid" x1={X0} x2={X1} y1={chart.y(v)} y2={chart.y(v)} />
      <text class="ltc-ylabel" x={X0 - 8} y={chart.y(v) + 4}>{fmtMg(v)}</text>
    {/each}
    {#each chart.bars as b (b.key)}
      <rect class="ltc-bar" class:ltc-bar--last={b.last} x={b.x} y={b.y} width={b.w} height={b.h} />
    {/each}
    {#each chart.maxLines as l (l.key)}
      <line class="ltc-max" x1={l.x1} x2={l.x2} y1={l.y} y2={l.y} />
    {/each}
    <!-- Värdena sist, så att de ligger över maxdoslinjen (med ljus kant runt texten). -->
    {#each chart.bars as b (b.key)}
      {#if b.w >= 34}<text class="ltc-val" x={b.cx} y={b.y - 5}>{b.label}</text>{/if}
    {/each}
    <line class="ltc-axis" x1={X0} x2={X1} y1={Y1} y2={Y1} />
    {#if chart.months.length === 0}
      <text class="ltc-xlabel ltc-xlabel--start" x={X0} y={Y1 + 18}>{fmtDate(r.first)}</text>
      <text class="ltc-xlabel ltc-xlabel--end" x={X1} y={Y1 + 18}>{fmtDate(today)}</text>
    {/if}
    {#each chart.months as m (m.x)}
      <line class="ltc-tick" x1={m.x} x2={m.x} y1={Y1} y2={Y1 + 5} />
      <text class="ltc-xlabel" x={m.x} y={Y1 + 18}>{m.label}</text>
      {#if m.year}<text class="ltc-xlabel ltc-xlabel--year" x={m.x} y={Y1 + 32}>{m.year}</text>{/if}
    {/each}
  </svg>
  <figcaption class="ltc-legend">
    <span class="ltc-key ltc-key--bar"></span>{unitLabel} mellan uttagen
    <span class="ltc-key ltc-key--last"></span>Sista uttaget, om slut idag
    {#if r.maxDose}<span class="ltc-key ltc-key--max"></span>Maxdos enligt receptet{/if}
  </figcaption>
</figure>
