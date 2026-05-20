<script lang="ts">
  import type { CalcResult } from '$lib/types';
  import { getActiveTexts, medCards, getActiveMedIdx, getPrescribeState, applyPrescribeStatePatch } from '$lib/state.svelte';
  import { pctClass } from '$lib/utils';
  import { DAYS_REMAINING_WARN } from '$lib/constants';
  import Alert from './Alert.svelte';

  let {
    result = null as CalcResult | null,
    nurseViewActive = false,
    onDecision = (_decision: 'yes' | 'no') => {},
  } = $props();

  let activeIdx = $derived(getActiveMedIdx());
  let card = $derived(medCards[activeIdx] ?? null);
  let patientLang = $derived(card?.patientLang ?? 'sv');
  let psEntry = $derived(card ? getPrescribeState(card._cardId) : null);

  function handleStartChoice(fromToday: boolean) {
    if (!card) return;
    applyPrescribeStatePatch(card._cardId, { startFromToday: fromToday });
  }

  function toggleLang() {
    const idx = getActiveMedIdx();
    if (idx >= 0 && idx < medCards.length) {
      medCards[idx].patientLang = patientLang === 'sv' ? 'en' : 'sv';
    }
  }

  let activeTab = $state<'patient' | 'journal'>('patient');
  let texts = $derived(getActiveTexts());
  let copied = $state(false);
  let copiedTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    return () => {
      if (copiedTimeout) clearTimeout(copiedTimeout);
    };
  });

  let tlWidthClass = $derived(pctClass(result?.tlPct ?? 0, 'w'));

  // Tvinga journal-flik i sjuksköterskeläge
  $effect(() => {
    activeTab = nurseViewActive ? 'journal' : 'patient';
  });

  function copyText() {
    const body = activeTab === 'patient'
      ? (patientLang === 'en' ? texts.patientTextEn : texts.patientText)
      : texts.journalText;
    if (body && navigator.clipboard) {
      navigator.clipboard.writeText(body).then(() => {
        copied = true;
        if (copiedTimeout) clearTimeout(copiedTimeout);
        copiedTimeout = setTimeout(() => { copied = false; }, 2000);
      }).catch(() => {});
    }
  }
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
          <button onclick={() => handleStartChoice(true)}
                  class:selected={psEntry?.startFromToday === true}>
            📅 Från dagens datum
          </button>
          <button onclick={() => handleStartChoice(false)}
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
              <svg viewBox="0 0 22 14" width="20" height="13" aria-hidden="true" class="flag-icon"><rect width="22" height="14" fill="#012169"/><line x1="0" y1="0" x2="22" y2="14" stroke="#FFF" stroke-width="4.5"/><line x1="22" y1="0" x2="0" y2="14" stroke="#FFF" stroke-width="4.5"/><line x1="0" y1="0" x2="22" y2="14" stroke="#C8102E" stroke-width="2"/><line x1="22" y1="0" x2="0" y2="14" stroke="#C8102E" stroke-width="2"/><rect x="8" width="6" height="14" fill="#FFF"/><rect y="4" width="22" height="6" fill="#FFF"/><rect x="9.5" width="3" height="14" fill="#C8102E"/><rect y="5.5" width="22" height="3" fill="#C8102E"/></svg>
              English
            {:else}
              <svg viewBox="0 0 22 14" width="20" height="13" aria-hidden="true" class="flag-icon"><rect width="22" height="14" fill="#006AA7"/><rect x="6" width="3" height="14" fill="#FECC02"/><rect y="5.5" width="22" height="3" fill="#FECC02"/></svg>
              Svenska
            {/if}
          </button>
        {/if}
        <button class="btn btn-ghost" data-tooltip="Kopiera texten till urklipp." onclick={copyText}>{copied ? '✅ Text kopierad till urklipp.' : '📋 Kopiera text'}</button>
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
