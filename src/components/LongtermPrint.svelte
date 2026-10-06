<script lang="ts">
  // Utskrift av långtidsanalysen (Ctrl+P eller knappen Skriv ut). Visas bara i utskrift, och bara
  // när långtidsanalysen är den aktiva vyn (print.css). Grafen är tidsskalad: varje stapel är lika
  // bred som perioden och står där perioden låg i tiden, så att uppehåll mellan uttag syns.
  import { getLtResult, getLtText, ltState } from '$lib/state/longterm.svelte';
  import { caseState } from '$lib/state/case.svelte';
  import { CONSUMPTION_NORMAL_HIGH, CONSUMPTION_NORMAL_LOW } from '$lib/constants';
  import { ltPeriodTotalText, strengthList } from '$lib/domain/texts';
  import { addDays, fmtDate, fmtFixed, fmtMg, fmtPct, getDaysDiff } from '$lib/utils';

  const version = __APP_VERSION__;
  const CLS_LABEL = { ok: 'I nivå', over: 'Över', under: 'Under' } as const;
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  // Grafens mått i SVG-enheter (skalas till sidbredden).
  const W = 720, H = 248;
  const X0 = 52, X1 = 708, Y0 = 12, Y1 = 194;

  let r = $derived(getLtResult());
  let mg = $derived(r.unit === 'mg');
  let u = $derived(r.unit);
  let dose = $derived(ltState.doseRaw.trim().replace('.', ','));
  // Bedömningen skrivs för hand på papperet, så textens tomma "Bedömning:" tas bort här.
  let text = $derived(getLtText().replace(/\n+Bedömning:\s*$/, ''));
  let strengths = $derived(r.kind === 'ok'
    ? [...new Set(r.periods.flatMap((p) => p.parts.map((x) => x.strength)))].sort((a, b) => a - b)
    : []);
  let subtitle = $derived([
    `Ordinerad dos ${dose || '–'} ${u}/dag`,
    ...(mg && strengths.length ? [`${strengthList(strengths)} räknat i mg`] : []),
  ].join(' · '));
  const amount = (n: number) => (r.unit === 'mg' ? fmtMg(n) : String(n));

  let chart = $derived.by(() => {
    if (r.kind !== 'ok') return null;
    const first = r.first;
    const spanDays = getDaysDiff(r.last, first) + 1;
    const x = (d: Date) => X0 + (getDaysDiff(d, first) / spanDays) * (X1 - X0);
    const maxPct = Math.max(...r.periods.map((p) => p.pct), r.pct);
    const yMax = Math.min(300, Math.max(160, Math.ceil(maxPct / 20) * 20));
    const y = (pct: number) => Y1 - (Math.min(pct, yMax) / yMax) * (Y1 - Y0);
    const step = yMax <= 200 ? 20 : 50;
    const grid = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);

    const bars = r.periods.map((p) => {
      const left = x(p.start);
      const full = x(addDays(p.end, 1)) - left;
      const gap = full > 8 ? 1.5 : 0;
      const w = Math.max(2, full - gap * 2);
      return {
        key: p.index, n: p.index + 1, x: left + gap, w, cx: left + full / 2,
        y: y(p.pct), h: Y1 - y(p.pct), label: fmtPct(p.pct), ok: p.cls === 'ok',
        clipped: p.pct > yMax,
      };
    });

    // Månadsmarkeringar på tidsaxeln; glesare ju längre tid som visas.
    const monthStep = spanDays <= 200 ? 1 : spanDays <= 400 ? 2 : spanDays <= 800 ? 3 : spanDays <= 1600 ? 6 : 12;
    const ticks: { x: number; label: string; year: string }[] = [];
    let t = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    if (t < first) t = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    while (getDaysDiff(t, first) <= spanDays) {
      const m = t.getUTCMonth();
      if (m % monthStep === 0 || monthStep === 1) {
        ticks.push({ x: x(t), label: MONTHS[m], year: m === 0 || ticks.length === 0 ? String(t.getUTCFullYear()) : '' });
      }
      t = new Date(Date.UTC(t.getUTCFullYear(), m + 1, 1));
    }

    return {
      bars, ticks, grid, y,
      band: { y: y(CONSUMPTION_NORMAL_HIGH), h: y(CONSUMPTION_NORMAL_LOW) - y(CONSUMPTION_NORMAL_HIGH) },
      ref: y(100), avg: y(r.pct),
      startLabel: fmtDate(first), endLabel: fmtDate(r.last),
    };
  });
</script>

<article class="lt-print">
  <header class="ltp-head">
    <div class="ltp-head__main">
      <p class="ltp-kicker">Förbrukningsanalys</p>
      <h1 class="ltp-title">{ltState.medName.trim() || 'Läkemedel'}</h1>
      <p class="ltp-sub">{subtitle}</p>
    </div>
    <dl class="ltp-meta">
      <div><dt>Patient</dt><dd class="ltp-blank"></dd></div>
      <div><dt>Utskriven</dt><dd>{caseState.today}</dd></div>
    </dl>
  </header>

  {#if r.kind === 'ok' && chart}
    <section class="ltp-facts" aria-label="Sammanfattning">
      <div class="ltp-fact ltp-fact--main">
        <span class="ltp-fact__k">Snittförbrukning</span>
        <span class="ltp-fact__v">{fmtPct(r.pct)}</span>
        <span class="ltp-fact__s">{fmtFixed(r.avgPerDay, 2)} {u}/dag · {CLS_LABEL[r.cls]}</span>
      </div>
      <div class="ltp-fact">
        <span class="ltp-fact__k">Analyserad tid</span>
        <span class="ltp-fact__v">{r.unionDays} dagar</span>
        <span class="ltp-fact__s">{fmtDate(r.first)} – {fmtDate(r.last)}</span>
      </div>
      <div class="ltp-fact">
        <span class="ltp-fact__k">Uttaget totalt</span>
        <span class="ltp-fact__v">{amount(r.total)} {u}</span>
        <span class="ltp-fact__s">{r.periods.length} {r.periods.length === 1 ? 'period' : 'perioder'}</span>
      </div>
    </section>

    {#if r.overlap}
      <p class="ltp-note">Perioderna överlappar. Överlappande dagar räknas en gång i den analyserade tiden, men allt uttaget räknas.</p>
    {/if}

    <figure class="ltp-chart">
      <figcaption class="ltp-h2">Förbrukning över tid, i procent av ordinerad dos</figcaption>
      <svg class="ltp-svg" viewBox="0 0 {W} {H}" role="img"
        aria-label={r.periods.map((p) => `Period ${p.index + 1}, ${fmtDate(p.start)} – ${fmtDate(p.end)}: ${fmtPct(p.pct)}`).join('; ')}>
        <rect class="ltp-band" x={X0} y={chart.band.y} width={X1 - X0} height={chart.band.h} />
        {#each chart.grid as g (g)}
          <line class="ltp-grid" x1={X0} x2={X1} y1={chart.y(g)} y2={chart.y(g)} />
          <text class="ltp-ylabel" x={X0 - 8} y={chart.y(g) + 4}>{g} %</text>
        {/each}
        {#each chart.bars as b (b.key)}
          <rect class="ltp-bar" class:ltp-bar--warn={!b.ok} x={b.x} y={b.y} width={b.w} height={b.h} />
          {#if b.w >= 30}<text class="ltp-val" x={b.cx} y={b.y - 5}>{b.label}{b.clipped ? ' ▲' : ''}</text>{/if}
          {#if b.w >= 14}<text class="ltp-pno" x={b.cx} y={Y1 + 13}>{b.n}</text>{/if}
        {/each}
        <line class="ltp-ref" x1={X0} x2={X1} y1={chart.ref} y2={chart.ref} />
        <line class="ltp-avg" x1={X0} x2={X1} y1={chart.avg} y2={chart.avg} />
        <line class="ltp-axis" x1={X0} x2={X1} y1={Y1} y2={Y1} />
        {#if chart.ticks.length === 0}
          <text class="ltp-xlabel ltp-xlabel--start" x={X0} y={Y1 + 35}>{chart.startLabel}</text>
          <text class="ltp-xlabel ltp-xlabel--end" x={X1} y={Y1 + 35}>{chart.endLabel}</text>
        {/if}
        {#each chart.ticks as t (t.x)}
          <line class="ltp-tick" x1={t.x} x2={t.x} y1={Y1 + 18} y2={Y1 + 23} />
          <text class="ltp-xlabel" x={t.x} y={Y1 + 35}>{t.label}</text>
          {#if t.year}<text class="ltp-xlabel ltp-xlabel--year" x={t.x} y={Y1 + 48}>{t.year}</text>{/if}
        {/each}
      </svg>
      <p class="ltp-legend">
        <span class="ltp-key ltp-key--ok"></span>I nivå
        <span class="ltp-key ltp-key--warn"></span>Över/under
        <span class="ltp-key ltp-key--band"></span>Normalt {CONSUMPTION_NORMAL_LOW}–{CONSUMPTION_NORMAL_HIGH} %
        <span class="ltp-key ltp-key--ref"></span>100 % = ordinerad dos
        <span class="ltp-key ltp-key--avg"></span>Snitt {fmtPct(r.pct)}
      </p>
      <p class="ltp-legend">Stapelns bredd är periodens längd. Siffran under stapeln är periodens nummer; mellanrum är tid utan uttag.</p>
    </figure>

    <table class="ltp-table">
      <thead>
        <tr><th>Nr</th><th>Period</th><th class="num">Dagar</th><th>Uttaget</th><th class="num">Snitt/dag ({u})</th><th class="num">Av dos</th><th>Status</th></tr>
      </thead>
      <tbody>
        {#each r.periods as p (p.index)}
          <tr>
            <td>{p.index + 1}</td>
            <td class="nowrap">{fmtDate(p.start)} – {fmtDate(p.end)}</td>
            <td class="num">{p.days}</td>
            <td>{ltPeriodTotalText(r.unit, p)}</td>
            <td class="num">{fmtFixed(p.avgPerDay, 2)}</td>
            <td class="num">{fmtPct(p.pct)}</td>
            <td>{CLS_LABEL[p.cls]}</td>
          </tr>
        {/each}
      </tbody>
    </table>

  {:else}
    <p class="ltp-note">Analysen är inte klar. Fyll i dos och minst en hel period innan du skriver ut.</p>
  {/if}

  <!-- Analystext, bedömning och sidfot hålls ihop: får de inte plats flyttar de till nästa sida tillsammans. -->
  <div class="ltp-tail">
  {#if r.kind === 'ok'}
    <section class="ltp-text">
      <h2 class="ltp-h2">Analystext</h2>
      <pre class="ltp-pre">{text}</pre>
    </section>
  {/if}

  <section class="ltp-assess">
    <h2 class="ltp-h2">Bedömning</h2>
    <div class="ltp-lines"><span></span><span></span><span></span><span></span></div>
    <div class="ltp-sign">
      <span>Datum</span><span>Signatur</span><span>Namnförtydligande</span>
    </div>
  </section>

  <footer class="ltp-foot">
    Recept {version} · Beräkningshjälpmedel. Förskrivaren gör den kliniska bedömningen. Underlaget är inmatat för hand och bör kontrolleras mot uttagshistoriken.
  </footer>
  </div>
</article>
