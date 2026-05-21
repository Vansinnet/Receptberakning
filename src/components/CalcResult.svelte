<script lang="ts">
  import type { CalcResult } from '$lib/types';
  import { getActiveTexts, medCards, appState, getPrescribeState, applyPrescribeStatePatch } from '$lib/state.svelte';
  import { pctClass } from '$lib/utils';
  import { copyable } from '$lib/actions.svelte';
  import { DAYS_REMAINING_WARN } from '$lib/constants';
  import Alert from './Alert.svelte';
  import FlagIcon from './FlagIcon.svelte';

  let {
    result = null as CalcResult | null,
    nurseViewActive = false,
    onDecision = (_decision: 'yes' | 'no'): void => {},
  } = $props();

  let activeIdx = $derived(appState.activeMedIdx);
  let card = $derived(medCards[activeIdx] ?? null);
  let patientLang = $derived(card?.patientLang ?? 'sv');
  let psEntry = $derived(card ? getPrescribeState(card._cardId) : null);

  function handleStartChoice(fromToday: boolean) {
    if (!card) return;
    applyPrescribeStatePatch(card._cardId, { startFromToday: fromToday });
  }

  function toggleLang() {
    const idx = appState.activeMedIdx;
    if (idx >= 0 && idx < medCards.length) {
      medCards[idx].patientLang = patientLang === 'sv' ? 'en' : 'sv';
    }
  }

  let activeTab = $state<'patient' | 'journal'>('patient');
  let texts = $derived(getActiveTexts());

  let tlWidthClass = $derived(pctClass(result?.tlPct ?? 0, 'w'));

  // Tvinga journal-flik i sjuksköterskeläge
  $effect(() => {
    activeTab = nurseViewActive ? 'journal' : 'patient';
  });
</script>

{#if result && result.valid && result.calculable !== false}
  <div class="result-content">
    <!-- Metrics -->
    {#if result.metrics?.length}
      <div class="result-grid">
        {#each result.metrics as m}
          <span class="rk" data-tooltip={m.tooltip}>{m.label}</span>
          <span class="rv {m.cls}">{m.value}</span>
        {/each}
      </div>
    {/if}

    <!-- Timeline -->
    {#if result.tlPct != null && result.tlStart && result.tlEnd}
      <div class="tl-wrap">
        <div class="tl-label" data-tooltip="Visar hur stor andel av receptperioden som förflutit sedan förskrivningsdatumet.">Receptperiod</div>
        <div class="tl-bar-bg">
          <div class="tl-fill tl-fill-{result.metrics?.[1]?.cls ?? 'ok'} {tlWidthClass}" role="progressbar" aria-valuenow={Math.round(result.tlPct)} aria-valuemin="0" aria-valuemax="100" aria-label="Förfluten andel av receptperioden">
            <div class="tl-today-marker"></div>
          </div>
        </div>
        <div class="tl-labels">
          <span>{result.tlStart}</span>
          <span class="tl-today-label">Idag</span>
          <span>{result.tlEnd}</span>
        </div>
      </div>
    {/if}

    <!-- Alerts -->
    {#if result.alerts?.length}
      <div aria-live="polite" aria-atomic="true">
        {#each result.alerts as a}
          <Alert type={a.type} title={a.title} message={a.message} />
        {/each}
      </div>
    {/if}

    <!-- Åtgärd krävs — endast i läkarläge -->
    {#if !nurseViewActive}
    <div class="early-decision-box">
      <div class="early-decision-label"><span aria-hidden="true">⚑ </span>Åtgärd krävs av medicinsk personal</div>
      <div class="early-decision-q">Utifrån ovanstående och patientens unika situation, bedöm om receptet ska förnyas.</div>
      <div class="early-decision-actions">
        <button type="button" class="btn early-btn early-btn-yes {card?.decision === 'yes' ? 'selected' : ''}" data-tooltip="Förnya receptet" onclick={() => onDecision('yes')}>✓ Förnya</button>
        <button type="button" class="btn early-btn early-btn-no {card?.decision === 'no' ? 'selected' : ''}" data-tooltip="Avslå förnyelse" onclick={() => onDecision('no')}>✕ Avslå</button>
      </div>
    </div>
    {#if card?.decision === 'yes' && result.daysToPrescribedEnd != null && result.daysToPrescribedEnd >= DAYS_REMAINING_WARN}
      <div class="start-date-choice">
        <div class="start-date-choice-label">
          Patienten har recept för {result.daysToPrescribedEnd} dagar till (t.o.m. {result.prescribedEndDateStr}).
          Vill du beräkna antalet förpackningar att förskriva utifrån dagens datum, eller då patienten borde ha slut på läkemedlet?
        </div>
        <div class="start-date-choice-actions">
          <button type="button" onclick={() => handleStartChoice(true)}
                   class:selected={psEntry?.startFromToday === true}>
            📅 Från dagens datum
          </button>
          <button type="button" onclick={() => handleStartChoice(false)}
                   class:selected={psEntry?.startFromToday === false}>
            🏁 Från beräknat slutdatum
          </button>
        </div>
      </div>
    {/if}
    {/if}

    <!-- Copy Section -->
    <div class="copy-section">
      <div class="copy-tabs-row" role="tablist" aria-label="Texttyp att kopiera">
        {#if !nurseViewActive}
          <button class="copy-tab {activeTab === 'patient' ? 'active' : ''}" role="tab" aria-selected={activeTab === 'patient'} data-tooltip="Förslag på formulering att skicka till patienten via 1177." onclick={() => activeTab = 'patient'}>Svar till patient (förslag)</button>
        {/if}
        <button class="copy-tab {activeTab === 'journal' ? 'active' : ''}" role="tab" aria-selected={activeTab === 'journal'} data-tooltip="Förslag på formulering för dokumentation i journalen." onclick={() => activeTab = 'journal'}>Journalanteckning (förslag)</button>
      </div>
      <div class="copy-body">
        {activeTab === 'patient'
          ? (patientLang === 'en' ? texts.patientTextEn : texts.patientText)
          : texts.journalText}
      </div>
      <div class="copy-footer">
        {#if !nurseViewActive && activeTab === 'patient'}
          <button class="btn btn-ghost" id="langBtnResult" data-tooltip="Växla språk på patientmeddelandet" onclick={toggleLang}>
            {#if patientLang === 'sv'}
              <FlagIcon lang="en" />
              English
            {:else}
              <FlagIcon lang="sv" />
              Svenska
            {/if}
          </button>
        {/if}
        <button class="btn btn-ghost" data-tooltip="Kopiera texten till urklipp." use:copyable={() => activeTab === 'patient' ? (patientLang === 'en' ? texts.patientTextEn : texts.patientText) : texts.journalText}>📋 Kopiera text</button>
      </div>
    </div>
  </div>
{:else if result && !result.valid}
  <div class="result-empty-state">
    <div class="empty-icon" aria-hidden="true">📋</div>
    <div>{result.statusText || 'Resultatet visas här'}</div>
  </div>
{:else}
  <div class="result-empty-state">
    <div class="empty-icon" aria-hidden="true">📋</div>
    <div>Fyll i formuläret för att se resultatet</div>
  </div>
{/if}
