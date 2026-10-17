<script lang="ts">
  // Långtidsanalys: underlaget (läkemedel, uttag, maxdos) till vänster, resultatet i mitten och
  // journaltexten till höger. Visar bara siffror, ingen tolkning (beslut 2026-10-18).
  import {
    applyLtDrug, clearLongterm, getLtContext, getLtResult, getLtText, ltState, setLtNameManually,
  } from '$lib/state/longterm.svelte';
  import { getToday } from '$lib/state/case.svelte';
  import { COPY_CONFIRM_MS, MAX_MED_NAME_LENGTH, UNIT_DISPLAY } from '$lib/constants';
  import { ltRate, ltRateUnit, ltRemainText, strengthList } from '$lib/domain/texts';
  import { copyToClipboard, fmtDate, fmtPct, stripManufacturer } from '$lib/utils';
  import { loadDrugs, searchDrugs, type DrugEntry } from '$lib/drug-search';
  import { createAutocomplete } from '$lib/autocomplete.svelte';
  import Icon from './Icon.svelte';
  import LtFills from './LtFills.svelte';
  import LtMaxDose from './LtMaxDose.svelte';
  import LtChart from './LtChart.svelte';
  import LtFillTable from './LtFillTable.svelte';
  import LongtermPrint from './LongtermPrint.svelte';

  // Samma sökning i läkemedelsdatabasen som i förnyelsevyn.
  const ac = createAutocomplete<DrugEntry>({
    searchFn: async (q) => { await loadDrugs(); return searchDrugs(q); },
    onSelect: (d) => applyLtDrug(d),
  });

  let r = $derived(getLtResult());
  let c = $derived(getLtContext());
  let text = $derived(getLtText());
  let today = $derived(getToday());
  let copied = $state(false);
  let unitLabel = $derived(ltRateUnit(r.unit, c.noun, c.interval));

  /** "Rad 3", "Rad 3 och 5", "Rad 2, 3 och 5". */
  function rowList(rows: number[]): string {
    const n = rows.map((i) => String(i + 1));
    return `Rad ${n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} och ${n[n.length - 1]}`}`;
  }

  function onNameInput(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    setLtNameManually(v);
    ac.search(v.trim());
  }

  async function copy() {
    if (await copyToClipboard(text)) {
      copied = true;
      setTimeout(() => (copied = false), COPY_CONFIRM_MS);
    }
  }
</script>

<div class="workspace workspace--lt">
  <section class="lt-form" aria-labelledby="lt-title">
    <h2 class="sr-only" id="lt-title">Underlag för långtidsanalys</h2>
    <div class="lt-drug">
      <label class="lbl" for="lt-med">Läkemedel och styrka</label>
      <input id="lt-med" class="input input--name" type="text" autocomplete="off" spellcheck="false" maxlength={MAX_MED_NAME_LENGTH}
        placeholder="Sök, t.ex. Imovane 7,5 mg" value={ltState.medName} oninput={onNameInput}
        onkeydown={ac.handleKeydown} onblur={ac.handleBlur}
        role="combobox" aria-autocomplete="list" aria-expanded={ac.visible} aria-controls="lt-ac-list"
        aria-activedescendant={ac.highlight >= 0 ? `lt-ac-${ac.highlight}` : undefined} />
      {#if ac.visible}
        <ul class="ac-dropdown" id="lt-ac-list" role="listbox" aria-label="Förslag från läkemedelsdatabasen">
          {#each ac.results as d, i (d.nplId + d.name + (d.packageSize ?? ''))}
            <li id="lt-ac-{i}" class="ac-item" role="option" aria-selected={i === ac.highlight}
              onmousedown={(e) => { e.preventDefault(); ac.select(d); }} onmouseenter={() => ac.highlightAt(i)}>
              <span class="ac-item__name">{stripManufacturer(d.name)}</span>
              <span class="ac-item__meta">{d.form ?? ''}{d.packageSize ? ` · ${d.packageSize} ${UNIT_DISPLAY[d.unit === 'ml' ? 'ml' : d.unit === 'dos' ? 'dos' : 'st'].short}` : ''}{d.regulation ? ` · narkotika klass ${d.regulation}` : ''}</span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if ltState.regulation}<span class="chip tone-warn lt-drug__chip">Narkotika klass {ltState.regulation}</span>{/if}
    </div>

    <LtFills />
    <LtMaxDose />

    <div class="section__row">
      <span class="topbar__spacer"></span>
      <button type="button" class="btn btn--ghost btn--sm" onclick={clearLongterm}>Rensa</button>
    </div>
  </section>

  <!-- Scrollbar resultatyta ska kunna nås med tangentbordet (axe: scrollable-region-focusable). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <section class="lt-result" aria-label="Resultat" tabindex="0">
    {#if r.kind === 'ok'}
      {#if r.skipped.length}
        <div class="note tone-warn">{rowList(r.skipped)} räknas inte. Fyll i datum och antal, eller rätta felet.</div>
      {/if}
      <div class="tiles lt-tiles">
        <div class="tile tile--main">
          <span class="tile__k">Snitt mellan första och sista uttaget</span>
          {#if r.average}
            <span class="tile__v">{ltRate(r.average.rate, c.interval)} <span class="tile__u">{unitLabel}</span></span>
            {#if r.average.pct !== null}<span class="tile__s tile__s--strong">{fmtPct(r.average.pct)} av maxdos</span>{/if}
            <span class="tile__s">{fmtDate(r.first)} – {fmtDate(r.last)} · {r.fills.length} uttag · {r.average.days} dagar</span>
          {:else}
            <span class="tile__v">–</span>
            <span class="tile__s">Kräver minst två uttag på olika dagar.</span>
          {/if}
        </div>
        {#if r.ifOutToday}
          <div class="tile">
            <span class="tile__k">Om patienten har slut idag</span>
            <span class="tile__v">{ltRate(r.ifOutToday.rate, c.interval)} <span class="tile__u">{unitLabel}</span></span>
            {#if r.ifOutToday.pct !== null}<span class="tile__s tile__s--strong">{fmtPct(r.ifOutToday.pct)} av maxdos</span>{/if}
            <span class="tile__s">Allt uttaget sedan {fmtDate(r.first)}</span>
          </div>
        {/if}
        {#if r.shouldRemain !== null}
          <div class="tile">
            <span class="tile__k">Borde finnas kvar vid senaste uttaget</span>
            <span class="tile__v">{ltRemainText(r, c.noun)}</span>
            <span class="tile__s">Räknat med maxdos, {fmtDate(r.last)}</span>
          </div>
        {/if}
      </div>
      {#if r.strengths.length > 1}
        <p class="hint">Uttag i styrkorna {strengthList(r.strengths)}, räknat i mg.</p>
      {/if}

      <div class="chart">
        <div class="chart__head">
          <h3 class="chart__title">{unitLabel} mellan uttagen</h3>
          <span class="hint">Stapelns bredd är tiden till nästa uttag.</span>
        </div>
        <LtChart {r} noun={c.noun} interval={c.interval} {today} />
      </div>

      <LtFillTable {r} noun={c.noun} interval={c.interval} />
    {:else}
      <div class="empty">Skriv in uttagen ur uttagshistoriken: datum och antal. Maxdosen är valfri.</div>
    {/if}
  </section>

  <aside class="texts-aside" aria-labelledby="lt-text-title">
    <div class="text-tabs"><h2 class="text-tab text-tab--static" id="lt-text-title">Journalanteckning</h2></div>
    {#if text}
      <textarea class="input text-area" aria-labelledby="lt-text-title" value={text} readonly></textarea>
      <div class="text-actions">
        <button type="button" class="btn btn--primary" onclick={copy}><Icon name="copy" /> Kopiera</button>
        <button type="button" class="btn" onclick={() => window.print()}><Icon name="printer" /> Skriv ut</button>
        <span class="text-actions__status" role="status">{copied ? 'Kopierad till urklipp' : ''}</span>
      </div>
      <span class="hint">Skriv din bedömning sist i texten efter att du klistrat in den. Utskriften (Ctrl+P) har diagram, tabell och plats för bedömning.</span>
    {:else if r.kind === 'ok'}
      <div class="empty">Texten skapas när alla rader är ifyllda och rätt.</div>
    {:else}
      <div class="empty">Texten skapas när analysen är klar.</div>
    {/if}
  </aside>
</div>

<LongtermPrint />
