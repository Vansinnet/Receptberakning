<script lang="ts">
  // Utskrift av långtidsanalysen (Ctrl+P eller knappen Skriv ut). Visas bara i utskrift, och bara
  // när långtidsanalysen är den aktiva vyn (print.css). Samma diagram och tabell som på skärmen.
  import { getLtContext, getLtResult, getLtText } from '$lib/state/longterm.svelte';
  import { caseState, getToday } from '$lib/state/case.svelte';
  import { ltMaxDoseText, ltRate, ltRateUnit, ltRemainText } from '$lib/domain/texts';
  import { fmtDate, fmtPct } from '$lib/utils';
  import LtChart from './LtChart.svelte';
  import LtFillTable from './LtFillTable.svelte';

  const version = __APP_VERSION__;

  let r = $derived(getLtResult());
  let c = $derived(getLtContext());
  let today = $derived(getToday());
  let unitLabel = $derived(ltRateUnit(r.unit, c.noun, c.interval));
  // Bedömningen skrivs för hand på papperet, så textens tomma "Bedömning:" tas bort här.
  let text = $derived(getLtText().replace(/\n?Bedömning:\s*$/, ''));
  let subtitle = $derived([
    ...(c.regulation ? [`Narkotika klass ${c.regulation}`] : []),
    r.kind === 'ok' && r.maxDose ? `Maxdos enligt receptet ${ltMaxDoseText(r, c)}` : 'Ingen maxdos angiven',
  ].join(' · '));
</script>

<article class="lt-print">
  <header class="ltp-head">
    <div class="ltp-head__main">
      <p class="ltp-kicker">Förbrukningsanalys</p>
      <h1 class="ltp-title">{c.medName.trim() || 'Läkemedel'}</h1>
      <p class="ltp-sub">{subtitle}</p>
    </div>
    <dl class="ltp-meta">
      <div><dt>Patient</dt><dd class="ltp-blank"></dd></div>
      <div><dt>Utskriven</dt><dd>{caseState.today}</dd></div>
    </dl>
  </header>

  {#if r.kind === 'ok'}
    <section class="ltp-facts" aria-label="Sammanfattning">
      <div class="ltp-fact ltp-fact--main">
        <span class="ltp-fact__k">Snitt mellan första och sista uttaget</span>
        <span class="ltp-fact__v">{r.average ? `${ltRate(r.average.rate, c.interval)} ${unitLabel}` : '–'}</span>
        {#if r.average}
          {#if r.average.pct !== null}<span class="ltp-fact__s">{fmtPct(r.average.pct)} av maxdos</span>{/if}
          <span class="ltp-fact__s">{fmtDate(r.first)} – {fmtDate(r.last)}, {r.fills.length} uttag</span>
        {:else}
          <span class="ltp-fact__s">Kräver minst två uttag</span>
        {/if}
      </div>
      <div class="ltp-fact">
        <span class="ltp-fact__k">Om patienten har slut idag</span>
        <span class="ltp-fact__v">{r.ifOutToday ? `${ltRate(r.ifOutToday.rate, c.interval)} ${unitLabel}` : '–'}</span>
        <span class="ltp-fact__s">{r.ifOutToday?.pct != null ? `${fmtPct(r.ifOutToday.pct)} av maxdos` : `Allt uttaget sedan ${fmtDate(r.first)}`}</span>
      </div>
      <div class="ltp-fact">
        <span class="ltp-fact__k">Borde finnas kvar vid senaste uttaget</span>
        <span class="ltp-fact__v">{r.shouldRemain !== null ? ltRemainText(r, c.noun) : '–'}</span>
        <span class="ltp-fact__s">{r.shouldRemain !== null ? 'Räknat med maxdos' : 'Kräver maxdos och två uttag'}</span>
      </div>
    </section>

    <section class="ltp-chart">
      <h2 class="ltp-h2">{unitLabel} mellan uttagen</h2>
      <LtChart {r} noun={c.noun} interval={c.interval} {today} />
      <p class="ltp-legend">Stapelns bredd är tiden till nästa uttag. Sista stapeln gäller om patienten har slut idag.</p>
    </section>

    <LtFillTable {r} noun={c.noun} interval={c.interval} cls="ltp-table" />
  {:else}
    <p class="ltp-note">Analysen är inte klar. Skriv in minst ett uttag innan du skriver ut.</p>
  {/if}

  <!-- Analystext, bedömning och sidfot hålls ihop: får de inte plats flyttar de till nästa sida tillsammans. -->
  <div class="ltp-tail">
    {#if text}
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
      Recept {version} · Beräkningshjälpmedel. Förskrivaren gör den kliniska bedömningen. Uttagen är inmatade för hand och bör kontrolleras mot uttagshistoriken.
    </footer>
  </div>
</article>
