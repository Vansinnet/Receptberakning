<script lang="ts">
  import { medCards, appState, pushMedCard, getActiveResult, clearAllMedState, getCardStatus } from '$lib/state.svelte';
  import { MAX_MED_CARDS } from '$lib/constants';
  import { needsRenewalWarning } from '$lib/utils';
  import AlertDialog from './AlertDialog.svelte';

  let confirmOpen = $state(false);

  function handleSelectMed(idx: number) {
    appState.activeMedIdx = idx;
  }

  function handleAddMed() {
    if (medCards.length >= MAX_MED_CARDS) return;
    pushMedCard();
    appState.activeMedIdx = medCards.length - 1;
  }

  function handleNewPatient() {
    confirmOpen = true;
  }

  function onConfirmClear() {
    confirmOpen = false;
    clearAllMedState();
  }

  function onCancelClear() {
    confirmOpen = false;
  }

  let activeIdx = $derived(appState.activeMedIdx);
  let result = $derived(getActiveResult());

  function getStatusDot(idx: number): { cls: string; text: string } {
    if (idx !== activeIdx) {
      const card = medCards[idx];
      const cs = getCardStatus(card._cardId);
      if (!card?.form?.medRaw) return { cls: '', text: 'Ej ifyllt' };
      if (!cs) return { cls: '', text: '—' };
      if (!cs.valid) return { cls: '', text: 'Ej ifyllt' };
      if (!cs.calculable) return { cls: '', text: cs.statusText || '—' };
      const warn = needsRenewalWarning(cs.consumptionPct, cs.daysToPrescribedEnd);
      return { cls: warn ? 'warn' : 'ok', text: cs.statusText };
    }
    // getActiveResult() är $derived — alltid aktuell. getCardStatus() uppdateras via $effect och kan vara en tick efter.
    if (!result) return { cls: '', text: '—' };
    if (!result.valid) return { cls: '', text: 'Ej ifyllt' };
    if (!result.calculable) return { cls: '', text: result.statusText || '—' };
    const warn = needsRenewalWarning(result.consumptionPct, result.daysToPrescribedEnd ?? 0);
    return { cls: warn ? 'warn' : 'ok', text: result.statusText || '' };
  }
</script>

<aside class="med-sidebar" aria-label="Läkemedelslista">
  <div class="sidebar-header">
    <span class="sidebar-label">Läkemedel</span>
  </div>
  <div class="med-list">
    {#each medCards as card, idx (card._cardId)}
      {@const dot = getStatusDot(idx)}
      <button
        class="med-item {idx === activeIdx ? 'active' : ''}"
        onclick={() => handleSelectMed(idx)}
      >
        <div class="med-item-info">
          <div class="med-item-name">{card.form.medRaw || `Läkemedel ${idx + 1}`}</div>
          <div class="med-item-status">{dot.text}</div>
        </div>
        <div class="status-dot {dot.cls}"></div>
      </button>
    {/each}
  </div>
  <button class="btn-add-med" class:is-hidden={medCards.length >= MAX_MED_CARDS} aria-label="Lägg till läkemedel" data-tooltip="Lägg till ett nytt läkemedel." onclick={handleAddMed}>
    <span aria-hidden="true">＋ </span>Lägg till
  </button>
  <button class="btn btn-ghost" data-tooltip="Rensa all data och börja om med en ny patient." onclick={handleNewPatient}>Ny patient</button>
</aside>

<AlertDialog
  open={confirmOpen}
  title="Rensa all data?"
  message="Är du säker på att du vill rensa all inmatad data? Detta kan inte ångras."
  onConfirm={onConfirmClear}
  onCancel={onCancelClear}
/>
