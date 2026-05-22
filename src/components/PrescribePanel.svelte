<script lang="ts">
  import { medCards, getPrescribeState, applyPrescribeStatePatch, appState, getCardStatus, getActiveResult, getHasSummary, getCachedResult, getPrescribeSummary, getActivePrescribeResult } from '$lib/state.svelte';
  import { canRenewMed, prescribeValidationHint } from '$lib/prescribe-calc';
  import { UNIT_DISPLAY, DEFAULT_PRESCRIBE_MODE, DEFAULT_PRESCRIBE_MONTHS } from '$lib/constants';
  import { applyDateMask } from '$lib/utils';

  let { visible = false } = $props();

  let card = $derived(medCards[appState.activeMedIdx] ?? null);
  let result = $derived(getActiveResult());

  let psEntry = $derived(card ? getPrescribeState(card._cardId) : null);
  let entryMode = $derived(psEntry?.mode ?? DEFAULT_PRESCRIBE_MODE);
  let entryMonths = $derived(psEntry?.months ?? DEFAULT_PRESCRIBE_MONTHS);
  let entryEndDate = $derived(psEntry?.endDate ?? '');

  let eligible = $derived(card && result ? canRenewMed({
    _cardId: card._cardId,
    valid: result.valid ?? false,
    calculable: result.calculable ?? false,
    decision: card.decision,
  }) : false);

  let displayPkgSize = $derived.by(() => {
    if (!card || !result?.valid || !result?.calculable) return '';
    const ps = getPrescribeState(card._cardId);
    if (ps?._pkgUserEdited) return ps.packageSize;
    return result.amt != null ? String(result.amt) : '';
  });

  function handlePkgInput(e: Event) {
    if (!card) return;
    const val = (e.target as HTMLInputElement).value;
    applyPrescribeStatePatch(card._cardId, { packageSize: val, _pkgUserEdited: val !== '' });
  }

  function handleModeChange(m: 'months' | 'date') {
    if (!card) return;
    applyPrescribeStatePatch(card._cardId, { mode: m });
  }

  function handleMonthsChange(e: Event) {
    if (!card) return;
    const m = parseInt((e.target as HTMLSelectElement).value, 10);
    applyPrescribeStatePatch(card._cardId, { months: m });
  }

  function handleEndDateInput(e: Event) {
    if (!card) return;
    applyDateMask(e.target as HTMLInputElement, (val) => {
      applyPrescribeStatePatch(card._cardId, { endDate: val });
    });
  }

  let prescResult = $derived(card ? getActivePrescribeResult() : null);

  let hasSummary = $derived(getHasSummary());
  let prescribeSummaries = $derived(getPrescribeSummary());
</script>

<section class="prescribe-panel" class:is-hidden={!visible} aria-label="Ny förskrivning">
  <!-- Duration -->
    <div id="prescribeDuration">
      <div class="prescribe-mode-toggle">
        <button type="button" class="prescribe-mode-btn {entryMode === 'months' ? 'active' : ''}" data-tooltip="Välj period i hela månader." onclick={() => handleModeChange('months')}>Månader</button>
        <button type="button" class="prescribe-mode-btn {entryMode === 'date' ? 'active' : ''}" data-tooltip="Välj ett specifikt slutdatum för förskrivningen." onclick={() => handleModeChange('date')}>Datum</button>
      </div>
      {#if entryMode === 'months'}
        <div class="field">
          <label for="ps-global-months" data-tooltip="Antal månader som den nya förskrivningen ska täcka.">Förskriva i antal månader</label>
          <select id="ps-global-months" class="prescribe-select" value={entryMonths} onchange={handleMonthsChange}>
            {#each Array.from({ length: 12 }, (_, i) => i + 1) as m}
              <option value={m}>{m === 1 ? '1 månad' : `${m} månader`}</option>
            {/each}
          </select>
        </div>
      {:else}
        <div class="field">
          <label for="ps-global-enddate" data-tooltip="Sista datum som den nya förskrivningen ska täcka.">Förskriva t.o.m.</label>
          <input id="ps-global-enddate" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD" maxlength="10" autocomplete="off" value={entryEndDate} oninput={handleEndDateInput} />
        </div>
      {/if}
    </div>

    <!-- Inner (per medication) -->
    {#if eligible && card && result}
      <div id="prescribeInner">
        <div class="prescribe-med-name">{result.medRaw || `Läkemedel ${appState.activeMedIdx + 1}`}</div>

        <div class="field prescribe-pkg-field">
          <label for="ps-pkg" data-tooltip="Antal enheter per förpackning.">Förpackningsstorlek ({UNIT_DISPLAY[(result.doseUnit ?? 'st') as keyof typeof UNIT_DISPLAY]?.long ?? 'tabletter'})</label>
          <input id="ps-pkg" type="number" min="1" step="1" placeholder="T.ex. 30" value={displayPkgSize} oninput={handlePkgInput} />
        </div>

        <div class="prescribe-info-row">
          <div class="prescribe-info-label" data-tooltip="Förskrivningen startar när nuvarande recept löper ut.">Förskrivning fr.o.m.</div>
          <div class="prescribe-info-val">{prescResult?.startDateStr ?? '—'}</div>
          {#if prescResult && prescResult.daysAlreadyCovered > 0}
            <div class="prescribe-info-sub">Nuv. recept täcker {prescResult.daysAlreadyCovered} dagar</div>
          {:else if prescResult && psEntry?.startFromToday}
            <div class="prescribe-info-sub">Beräknas från dagens datum</div>
          {:else}
            <div class="prescribe-info-sub is-hidden"></div>
          {/if}
        </div>

        <div id="ps-result">
          {#if prescResult && prescResult.packages > 0}
            <div class="prescribe-result">
              <div class="prescribe-result-label" data-tooltip="Antal förpackningar som krävs.">Antal förpackningar att förskriva</div>
              <div class="prescribe-result-num-row">
                <div class="prescribe-result-packages">{prescResult.packages}</div>
                <div class="prescribe-result-unit">förp. à {prescResult.packageSize} {prescResult.unitLabelShort}</div>
              </div>
              <div class="prescribe-result-details" data-tooltip="Totalt antal enheter dividerat med förpackningsstorlek.">{prescResult.totalTablets} {prescResult.unitLabelLong} ÷ {prescResult.packageSize} {prescResult.unitLabelShort}/förp.</div>
              <div class="prescribe-result-period" data-tooltip="Period som den nya förskrivningen täcker.">{prescResult.startDateStr} – {prescResult.endDateStr}</div>
              <div class="prescribe-result-days" data-tooltip="Totalt antal dagar.">{prescResult.totalDays} dagar</div>
            </div>
          {:else if prescResult && prescResult.packages === 0 && prescResult.totalDays === 0 && prescResult.daysAlreadyCovered > 0}
            <div class="prescribe-result-covered">Nuvarande recept täcker redan hela perioden.</div>
          {:else if psEntry}
            {#each prescribeValidationHint(
              { _cardId: card._cardId, prescribedEndDateStr: result.prescribedEndDateStr },
              psEntry
            ) as hint}
              <div class="alert alert-{hint.type}" role="alert">{hint.msg}</div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}

    <!-- Summary -->
    {#if hasSummary}
      <div id="prescribeSummary">
        <div class="prescribe-summary-wrap">
          <div class="prescribe-summary-header">Sammanställning av läkemedel att förskriva</div>
          <div class="prescribe-summary-list">
            {#each medCards as c, i (c._cardId)}
              {@const status = getCardStatus(c._cardId)}
              {#if getPrescribeState(c._cardId) && canRenewMed({
                _cardId: c._cardId,
                valid: status?.valid ?? false,
                calculable: status?.calculable ?? false,
                decision: c.decision,
              })}
                {@const pr = prescribeSummaries[c._cardId]}
                <button type="button" class="prescribe-summary-row {i === appState.activeMedIdx ? 'active' : ''}" onclick={() => appState.activeMedIdx = i}>
                  <span class="prescribe-summary-name">{c.form.medRaw || `Läkemedel ${i + 1}`}</span>
                  <span class="prescribe-summary-right">
                    <span class="prescribe-summary-pkg">{pr?.packages ?? '—'} förp.</span>
                  </span>
                </button>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </section>
