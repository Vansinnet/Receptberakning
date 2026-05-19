<script lang="ts">
  import { medCards, getPrescribeState, initPrescribeState, applyPrescribeStatePatch, getActiveMedIdx, setActiveMedIdx, getCardStatus, getActiveResult, getHasSummary } from '$lib/state.svelte';
  import { calcPrescribeResult, canRenewMed, prescribeValidationHint } from '$lib/prescribe-calc';
  import { UNIT_DISPLAY, DEFAULT_PRESCRIBE_MODE, DEFAULT_PRESCRIBE_MONTHS } from '$lib/constants';
  import type { MedState } from '$lib/types';

  let { visible = false } = $props();

  let activeIdx = $derived(getActiveMedIdx()); // keep for template display
  let card = $derived(medCards[activeIdx] ?? null);
  let result = $derived(getActiveResult());

  let psEntry = $derived(card ? getPrescribeState(card._cardId) : null);
  let entryMode = $derived(psEntry?.mode ?? DEFAULT_PRESCRIBE_MODE);
  let entryMonths = $derived(psEntry?.months ?? DEFAULT_PRESCRIBE_MONTHS);
  let entryEndDate = $derived(psEntry?.endDate ?? '');

  let eligible = $derived(card && result ? canRenewMed({
    _cardId: card._cardId,
    valid: result.valid ?? false,
    calculable: result.calculable ?? false,
    isOveruse: result.isOveruse ?? false,
    isTooEarly: result.isTooEarly ?? false,
    earlyRenewalDecision: card.earlyRenewalDecision,
  }) : false);

  // AMT-spegling: kopiera amt till packageSize vid init eller ändring
  $effect(() => {
    if (!card) return;
    const s = result;
    if (!s?.valid || !s?.calculable) return;
    const currentAmt = String(s.amt ?? '');
    const ps = getPrescribeState(card._cardId);
    if (ps && ps._lastAmt === currentAmt && ps.packageSize !== '') return;
    if (!ps) {
      initPrescribeState(card._cardId, { packageSize: currentAmt, _lastAmt: currentAmt });
    } else {
      if (ps._lastAmt !== currentAmt && currentAmt !== '') {
        applyPrescribeStatePatch(card._cardId, { _lastAmt: currentAmt, packageSize: currentAmt });
      } else if (ps.packageSize === '') {
        applyPrescribeStatePatch(card._cardId, { packageSize: currentAmt });
      }
    }
  });

  function handlePkgInput(e: Event) {
    if (!card) return;
    const val = (e.target as HTMLInputElement).value;
    applyPrescribeStatePatch(card._cardId, { packageSize: val });
  }

  function handleModeChange(m: string) {
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
    const input = e.target as HTMLInputElement;
    const originalVal = input.value;
    let val = originalVal.replace(/\D/g, '').substring(0, 8);
    if (val.length > 4) val = val.substring(0, 4) + '-' + val.substring(4);
    if (val.length > 7) val = val.substring(0, 7) + '-' + val.substring(7);
    const sel = input.selectionStart ?? 0;
    const digitsBefore = originalVal.substring(0, sel).replace(/\D/g, '').length;
    applyPrescribeStatePatch(card._cardId, { endDate: val });
    if (val !== originalVal) {
      let newPos = 0, count = 0;
      for (let i = 0; i < val.length; i++) {
        if (/\d/.test(val[i])) count++;
        if (count === digitsBefore) { newPos = i + 1; break; }
      }
      if (count < digitsBefore) newPos = val.length;
      const target = newPos;
      requestAnimationFrame(() => {
        try { input.setSelectionRange(target, target); } catch (_) {}
      });
    }
  }

  let prescResult = $derived.by(() => {
    if (!card || !result?.valid || !result?.calculable) return null;
    const ps = getPrescribeState(card._cardId);
    const s: MedState = {
      _cardId: card._cardId,
      dose: result.dose,
      doseInterval: result.doseInterval,
      doseUnit: result.doseUnit,
      prescribedEndDateStr: result.prescribedEndDateStr,
    };
    return calcPrescribeResult(s, ps ?? null);
  });

  let hasSummary = $derived(getHasSummary());
</script>

<section class="prescribe-panel" class:is-hidden={!visible && !hasSummary} aria-label="Ny förskrivning">
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
        <div class="prescribe-med-name">{result.medRaw || `Läkemedel ${activeIdx + 1}`}</div>

        <div class="field prescribe-pkg-field">
          <label for="ps-pkg" data-tooltip="Antal enheter per förpackning.">Förpackningsstorlek ({UNIT_DISPLAY[(result.doseUnit ?? 'st') as keyof typeof UNIT_DISPLAY]?.long ?? 'tabletter'})</label>
          <input id="ps-pkg" type="number" min="1" step="1" placeholder="T.ex. 30" value={psEntry?.packageSize ?? ''} oninput={handlePkgInput} />
        </div>

        <div class="prescribe-info-row">
          <div class="prescribe-info-label" data-tooltip="Förskrivningen startar när nuvarande recept löper ut.">Förskrivning fr.o.m.</div>
          <div class="prescribe-info-val">{prescResult?.startDateStr ?? '—'}</div>
          {#if prescResult && prescResult.daysAlreadyCovered > 0}
            <div class="prescribe-info-sub">Nuv. recept täcker {prescResult.daysAlreadyCovered} dagar</div>
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
            {#each medCards as c, i}
              {@const status = getCardStatus(c._cardId)}
              {#if getPrescribeState(c._cardId) && canRenewMed({
                _cardId: c._cardId,
                valid: status?.valid ?? false,
                calculable: status?.calculable ?? false,
                isOveruse: status?.isOveruse ?? false,
                isTooEarly: status?.isTooEarly ?? false,
                earlyRenewalDecision: c.earlyRenewalDecision,
              })}
                {@const d = parseFloat((c.form.doseRaw || '').replace(',', '.')) || 0}
                {@const pr = calcPrescribeResult({
                  _cardId: c._cardId,
                  dose: d,
                  doseInterval: c.form.doseInterval,
                  doseUnit: c.form.doseUnit,
                  prescribedEndDateStr: status?.prescribedEndDateStr ?? '',
                }, getPrescribeState(c._cardId) ?? null)}
                <button type="button" class="prescribe-summary-row {i === activeIdx ? 'active' : ''}" onclick={() => setActiveMedIdx(i)}>
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
