<script lang="ts">
  import { MAX_MED_CARDS } from '$lib/constants';
  import { STATUS_LABEL, STATUS_TONE } from '$lib/domain/renewal';
  import { addMed, caseState, clearCase, getResults, selectMed } from '$lib/state/case.svelte';
  import { clearLongterm } from '$lib/state/longterm.svelte';
  import { CLASS_LABEL, interactionsUpdated, type InteractionResult } from '$lib/interactions';
  import type { Tone } from '$lib/types';
  import { stripManufacturer } from '$lib/utils';
  import Icon from './Icon.svelte';

  let { interactions = { warnings: [], unchecked: [] }, nplIds = [] }: { interactions?: InteractionResult; nplIds?: string[] } = $props();
  let warnings = $derived(interactions.warnings);
  let checkedCount = $derived(caseState.meds.filter((m) => m.form.name.trim()).length - interactions.unchecked.length);

  const DECISION: Record<string, string> = { yes: 'Förnyas', no: 'Avslås' };

  let rows = $derived(caseState.meds.map((m, i) => {
    const r = getResults()[i];
    let tone: Tone = 'muted';
    let status = 'Ej ifyllt';
    if (r.renewal.kind === 'ok') { tone = STATUS_TONE[r.renewal.status]; status = STATUS_LABEL[r.renewal.status]; }
    else if (r.renewal.kind === 'manual') status = 'Manuell bedömning';
    else if (r.renewal.kind === 'implausible') { tone = 'bad'; status = 'Orimliga värden'; }
    else if (r.renewal.kind === 'invalid') { tone = 'bad'; status = 'Kontrollera fälten'; }
    const packs = r.prescription?.kind === 'ok' ? ` · ${r.prescription.packages} förp.` : '';
    return {
      id: m.id,
      name: stripManufacturer(m.form.name) || 'Nytt läkemedel',
      tone, status,
      decision: m.decision ? DECISION[m.decision] + packs : '',
    };
  }));

  let janusmedUrl = $derived(nplIds.length >= 2
    ? 'https://janusmed.se/interaktioner?' + nplIds.map((id) => 'nplIds=' + encodeURIComponent(id)).join('&')
    : '');

  function confirmClear() {
    clearCase();
    clearLongterm();
  }
</script>

<aside class="case-aside" aria-labelledby="case-title">
  <div class="aside-head">
    <h2 class="aside-title" id="case-title">Ärende</h2>
    <span class="aside-count">{caseState.meds.length} av {MAX_MED_CARDS}</span>
  </div>

  <ul class="med-list">
    {#each rows as row (row.id)}
      <li>
        <button type="button" class="med-item" aria-current={row.id === caseState.activeId} onclick={() => selectMed(row.id)}>
          <span class="med-item__name">{row.name}</span>
          <span class="med-item__meta">
            <span class="chip tone-{row.tone}">{row.status}</span>
            {#if row.decision}<span>{row.decision}</span>{/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>

  {#if caseState.meds.length < MAX_MED_CARDS}
    <button type="button" class="btn btn--ghost btn--left" onclick={() => addMed()}>
      <Icon name="plus" /> Lägg till läkemedel
    </button>
  {/if}

  {#if warnings.length > 0}
    <div class="aside-box aside-box--{warnings[0].severity}" role="status">
      <span class="aside-box__title">Interaktioner enligt Janusmed</span>
      <ul class="ix-list">
        {#each warnings as w, i (i)}
          <li class="ix">
            <span class="ix__drugs">{stripManufacturer(w.drugs[0])} + {stripManufacturer(w.drugs[1])}</span>
            {#each w.pairs as p (p.a + p.b)}
              <span class="ix__pair">
                <span class="ix__cls ix__cls--{p.cls[0]}" title="Klass {p.cls[0]}: {CLASS_LABEL[p.cls[0] as 'B' | 'C' | 'D']}. Dokumentationsgrad {p.cls[1]} av 4.">{p.cls}</span>
                {p.a} – {p.b}
              </span>
            {/each}
            <span class="ix__label">{CLASS_LABEL[w.cls[0] as 'B' | 'C' | 'D']}</span>
          </li>
        {/each}
      </ul>
      {#if janusmedUrl}<a href={janusmedUrl} target="_blank" rel="noopener noreferrer">Läs mer och se åtgärder i Janusmed</a>{/if}
    </div>
  {:else if checkedCount >= 2}
    <div class="aside-box">
      Inga interaktioner av klass B–D enligt Janusmed{#if interactionsUpdated()} ({interactionsUpdated()}){/if}.
      {#if janusmedUrl}<a href={janusmedUrl} target="_blank" rel="noopener noreferrer">Kontrollera i Janusmed</a>{/if}
    </div>
  {/if}
  {#if interactions.unchecked.length > 0 && caseState.meds.filter((m) => m.form.name.trim()).length >= 2}
    <div class="aside-box">
      <span>Kunde inte kontrolleras mot interaktionsdatan: {interactions.unchecked.map(stripManufacturer).join(', ')}.</span>
      <span class="ix__label">Välj läkemedlet ur listan, eller kontrollera i Janusmed.</span>
    </div>
  {/if}

</aside>

<div class="case-foot">
  {#if caseState.confirmClear}
    <div class="confirm" role="alertdialog" aria-labelledby="confirm-q">
      <span class="confirm__q" id="confirm-q">Rensa all data för patienten?</span>
      <span class="confirm__actions">
        <button type="button" class="btn btn--sm btn--danger" onclick={confirmClear}>Rensa</button>
        <button type="button" class="btn btn--sm" onclick={() => (caseState.confirmClear = false)}>Avbryt</button>
      </span>
    </div>
  {:else}
    <button type="button" class="btn btn--block" onclick={() => (caseState.confirmClear = true)}>Ny patient</button>
  {/if}
  <span class="privacy">Ingen data lämnar webbläsaren. Allt rensas efter 22 minuter utan aktivitet, när fliken stängs och – på mobil – efter 5 minuter i bakgrunden.</span>
  <span class="privacy">
    Beräkningshjälpmedel – förskrivaren ansvarar alltid för kliniska beslut.
    <a href="https://github.com/Vansinnet/Receptberakning/blob/main/disclaimer.md" target="_blank" rel="noopener noreferrer">Ansvarsfriskrivning</a> ·
    <a href="https://github.com/Vansinnet/Receptberakning/blob/main/readme.md" target="_blank" rel="noopener noreferrer">Licens</a>
  </span>
</div>
