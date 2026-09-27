<script lang="ts">
  import { addPeriod, clearLongterm, getLtResult, getLtText, ltState, removePeriod } from '$lib/state/longterm.svelte';
  import { CONSUMPTION_NORMAL_HIGH, CONSUMPTION_NORMAL_LOW, COPY_CONFIRM_MS, LT_CHART_MAX_PCT, MAX_LT_PERIODS } from '$lib/constants';
  import { copyToClipboard, fmtDate, fmtFixed, fmtPct } from '$lib/utils';
  import Icon from './Icon.svelte';
  import DateField from './DateField.svelte';
  import { caseState } from '$lib/state/case.svelte';

  let r = $derived(getLtResult());
  let text = $derived(getLtText());
  let copied = $state(false);

  const CLS_LABEL = { ok: 'I nivå', over: 'Över', under: 'Under' } as const;
  const h = (pct: number) => `${Math.min(100, (pct / LT_CHART_MAX_PCT) * 100)}%`;


  async function copy() {
    if (await copyToClipboard(text)) {
      copied = true;
      setTimeout(() => (copied = false), COPY_CONFIRM_MS);
    }
  }
</script>

<div class="workspace">
  <section class="lt-form" aria-labelledby="lt-title">
    <h2 class="sr-only" id="lt-title">Underlag för långtidsanalys</h2>
    <div class="lt-top">
      <div class="lt-top__name">
        <label class="lbl" for="lt-med">Läkemedel och styrka</label>
        <input id="lt-med" class="input" type="text" autocomplete="off" maxlength="100" bind:value={ltState.medName} />
      </div>
      <div class="lt-top__dose">
        <label class="lbl" for="lt-dose">Dos (enheter/dag)</label>
        <input id="lt-dose" class="input" type="text" inputmode="decimal" autocomplete="off" bind:value={ltState.doseRaw}
          aria-invalid={!!r.doseError} aria-describedby="lt-dose-err" />
        {#if r.doseError}<div class="field-error" id="lt-dose-err">{r.doseError}</div>{/if}
      </div>
    </div>

    <div class="lt-grid" role="group" aria-label="Perioder">
      <span></span>
      <span class="lt-grid__head">Från</span>
      <span class="lt-grid__head">Till och med</span>
      <span class="lt-grid__head">Uttaget</span>
      <span></span>
      {#each ltState.periods as p, i (i)}
        {@const e = r.errors[i] ?? {}}
        <span class="lt-grid__no">{i + 1}</span>
        <div>
          <DateField compact label="Från, period {i + 1}" value={p.startRaw} onchange={(v) => (ltState.periods[i].startRaw = v)}
            max={caseState.today} invalid={!!e.start} />
          {#if e.start}<div class="field-error">{e.start}</div>{/if}
        </div>
        <div>
          <DateField compact label="Till och med, period {i + 1}" value={p.endRaw} onchange={(v) => (ltState.periods[i].endRaw = v)}
            max={caseState.today} invalid={!!e.end} />
          {#if e.end}<div class="field-error">{e.end}</div>{/if}
        </div>
        <div>
          <input class="input" type="text" inputmode="numeric" aria-label="Uttaget, period {i + 1}" bind:value={p.totalRaw} aria-invalid={!!e.total} />
          {#if e.total}<div class="field-error">{e.total}</div>{/if}
        </div>
        <button type="button" class="btn btn--ghost btn--icon" aria-label="Ta bort period {i + 1}" onclick={() => removePeriod(i)}>
          <Icon name="x" size={14} />
        </button>
      {/each}
    </div>

    <div class="section__row">
      {#if ltState.periods.length < MAX_LT_PERIODS}
        <button type="button" class="btn btn--ghost" onclick={() => addPeriod()}><Icon name="plus" size={14} /> Lägg till period</button>
      {/if}
      <span class="topbar__spacer"></span>
      <button type="button" class="btn btn--ghost btn--sm" onclick={clearLongterm}>Rensa</button>
    </div>
    <p class="hint">Båda datumen räknas in i perioden. Överlappande dagar räknas en gång. Uttaget = antal enheter som hämtats ut under perioden.</p>
  </section>

  <!-- Scrollbar resultatyta ska kunna nås med tangentbordet (axe: scrollable-region-focusable). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <section class="lt-result" aria-label="Resultat" tabindex="0">
    {#if r.kind === 'ok'}
      {#if r.overlap}
        <div class="note tone-warn">Perioderna överlappar. Överlappande dagar räknas bara en gång i den totala tiden.</div>
      {/if}
      <div class="tiles">
        <div class="tile">
          <span class="tile__k">Analyserad tid</span>
          <span class="tile__v">{r.unionDays} dagar</span>
          <span class="tile__s">{fmtDate(r.first)} – {fmtDate(r.last)}</span>
        </div>
        <div class="tile">
          <span class="tile__k">Uttaget totalt</span>
          <span class="tile__v">{r.total}</span>
          <span class="tile__s">{r.periods.length} {r.periods.length === 1 ? 'period' : 'perioder'}</span>
        </div>
        <div class="tile">
          <span class="tile__k">Snittförbrukning</span>
          <span class="tile__v fg-{r.tone}">{fmtPct(r.pct)}</span>
          <span class="tile__s">{fmtFixed(r.avgPerDay, 2)} per dag mot ordinerat {ltState.doseRaw.trim().replace('.', ',')}</span>
        </div>
      </div>

      <div class="chart">
        <div class="chart__head">
          <h3 class="chart__title">Förbrukning per period, i procent av ordinerad dos</h3>
          <span class="hint">Skuggat fält = {CONSUMPTION_NORMAL_LOW}–{CONSUMPTION_NORMAL_HIGH} %</span>
        </div>
        <div class="chart__plot" role="img" aria-label={r.periods.map((p) => `Period ${p.index + 1}: ${fmtPct(p.pct)}`).join(', ')}>
          <div class="chart__band" style:bottom={h(CONSUMPTION_NORMAL_LOW)} style:height="{((CONSUMPTION_NORMAL_HIGH - CONSUMPTION_NORMAL_LOW) / LT_CHART_MAX_PCT) * 100}%"></div>
          <div class="chart__ref" style:bottom={h(100)}></div>
          <span class="chart__reflabel" style:bottom={h(100)}>100 %</span>
          {#each r.periods as p (p.index)}
            <div class="chart__col">
              <span class="chart__val fg-{p.cls === 'ok' ? 'ok' : 'warn'}">{fmtPct(p.pct)}</span>
              <div class="chart__bar" class:chart__bar--warn={p.cls !== 'ok'} style:height={h(p.pct)}></div>
            </div>
          {/each}
        </div>
        <div class="chart__labels" aria-hidden="true">
          {#each r.periods as p (p.index)}<span class="chart__label">Period {p.index + 1}</span>{/each}
        </div>
      </div>

      <table class="table">
        <caption class="sr-only">Förbrukning per period</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Datum</th><th scope="col">Dagar</th><th scope="col">Uttaget</th><th scope="col">Snitt per dag</th><th scope="col">Av ordinerad dos</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {#each r.periods as p (p.index)}
            <tr>
              <td>{p.index + 1}</td>
              <td>{fmtDate(p.start)} – {fmtDate(p.end)}</td>
              <td>{p.days}</td>
              <td>{p.total}</td>
              <td>{fmtFixed(p.avgPerDay, 2)}</td>
              <td>{fmtPct(p.pct)}</td>
              <td><span class="chip tone-{p.cls === 'ok' ? 'ok' : 'warn'}">{CLS_LABEL[p.cls]}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty">Fyll i dos och minst en hel period för att se analysen.</div>
    {/if}
  </section>

  <aside class="texts-aside" aria-labelledby="lt-text-title">
    <div class="text-tabs"><h2 class="text-tab text-tab--static" id="lt-text-title">Journalanteckning</h2></div>
    {#if text}
      <textarea class="input text-area" aria-labelledby="lt-text-title" value={text} readonly></textarea>
      <div class="text-actions">
        <button type="button" class="btn btn--primary" onclick={copy}><Icon name="copy" /> Kopiera</button>
        <span class="text-actions__status" role="status">{copied ? 'Kopierad till urklipp' : ''}</span>
      </div>
      <span class="hint">Skriv din bedömning sist i texten efter att du klistrat in den.</span>
    {:else}
      <div class="empty">Texten skapas när analysen är klar.</div>
    {/if}
  </aside>
</div>
