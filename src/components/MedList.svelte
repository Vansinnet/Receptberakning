<script lang="ts">
  import { medCards, getActiveMedIdx, setActiveMedIdx, pushMedCard, getActiveResult, clearAllMedState, getCardStatus } from '$lib/state.svelte';

  function handleSelectMed(idx: number) {
    setActiveMedIdx(idx);
  }

  function handleAddMed() {
    pushMedCard();
    setActiveMedIdx(medCards.length - 1);
  }

  function handleNewPatient() {
    if (confirm('Är du säker på att du vill rensa all inmatad data? Detta kan inte ångras.')) {
      clearAllMedState();
    }
  }

  let activeIdx = $derived(getActiveMedIdx());
  let result = $derived(getActiveResult());

  function getStatusDot(idx: number): { cls: string; text: string } {
    if (idx !== activeIdx) {
      const card = medCards[idx];
      const cs = getCardStatus(card._cardId);
      if (!card?.form?.medRaw) return { cls: '', text: 'Ej ifyllt' };
      if (!cs) return { cls: '', text: '—' };
      if (!cs.valid) return { cls: '', text: 'Ej ifyllt' };
      if (!cs.calculable) return { cls: '', text: cs.statusText || '—' };
      if (cs.isOveruse && cs.earlyRenewalDecision === 'yes') return { cls: 'ok', text: cs.statusText };
      if (cs.isOveruse) return { cls: 'warn', text: cs.statusText };
      if (cs.isTooEarly && cs.earlyRenewalDecision === 'yes') return { cls: 'ok', text: cs.statusText };
      if (cs.isTooEarly) return { cls: 'warn', text: cs.statusText };
      return { cls: 'ok', text: cs.statusText };
    }
    if (!result) return { cls: '', text: '—' };
    if (!result.valid) return { cls: '', text: 'Ej ifyllt' };
    if (!result.calculable) return { cls: '', text: result.statusText || '—' };
    if (result.isOveruse && result.earlyRenewalDecision === 'yes') return { cls: 'ok', text: result.statusText || '' };
    if (result.isOveruse) return { cls: 'warn', text: result.statusText || '' };
    if (result.isTooEarly && result.earlyRenewalDecision === 'yes') return { cls: 'ok', text: result.statusText || '' };
    if (result.isTooEarly) return { cls: 'warn', text: result.statusText || '' };
    return { cls: 'ok', text: result.statusText || '' };
  }
</script>

<aside class="med-sidebar" aria-label="Läkemedelslista">
  <div class="sidebar-header">
    <span class="sidebar-label">Läkemedel</span>
  </div>
  <div class="med-list">
    {#each medCards as card, idx}
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
  <button class="btn-add-med" aria-label="Lägg till läkemedel" data-tooltip="Lägg till ett nytt läkemedel." onclick={handleAddMed}>
    <span>＋</span> Lägg till
  </button>
  <button class="btn btn-ghost" data-tooltip="Rensa all data och börja om med en ny patient." onclick={handleNewPatient}>Ny patient</button>
</aside>
