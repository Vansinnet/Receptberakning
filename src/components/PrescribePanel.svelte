<script lang="ts">
  import { getActiveMedIdx, medCards, getPrescribeState, initPrescribeState, applyPrescribeStatePatch } from '$lib/state.svelte';
  import { calcPrescribeResult, canRenewMed, prescribeValidationHint, setPrescribeMode, setPrescribeMonths, setPrescribeEndDate } from '$lib/prescribe-calc';
  import { getActiveResult } from '$lib/state.svelte';
  import { UNIT_DISPLAY, DEFAULT_PRESCRIBE_MODE, DEFAULT_PRESCRIBE_MONTHS, DEFAULT_PRESCRIBE_END_DATE } from '$lib/constants';
  import type { MedState } from '$lib/types';

  let { visible = false } = $props();

  // Lokal $state speglar globalerna — Svelte-spårbar reaktivitet
  let mode = $state(DEFAULT_PRESCRIBE_MODE);
  let months = $state(DEFAULT_PRESCRIBE_MONTHS);
  let endDate = $state(DEFAULT_PRESCRIBE_END_DATE);

  let activeIdx = $derived(getActiveMedIdx());
  let card = $derived(medCards[activeIdx] ?? null);
  let result = $derived(getActiveResult());

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
    const ps = getPrescribeState(activeIdx);
    if (!ps) {
      initPrescribeState(activeIdx, { packageSize: currentAmt, _lastAmt: currentAmt });
    } else {
      if (ps._lastAmt !== currentAmt && currentAmt !== '') {
        applyPrescribeStatePatch(activeIdx, { _lastAmt: currentAmt, packageSize: currentAmt });
      } else if (ps.packageSize === '') {
        applyPrescribeStatePatch(activeIdx, { packageSize: currentAmt });
      }
    }
  });

  function handlePkgInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    applyPrescribeStatePatch(activeIdx, { packageSize: val });
  }

  function handleModeChange(m: string) {
    mode = m;
    setPrescribeMode(m);
  }

  function handleMonthsChange(e: Event) {
    const m = parseInt((e.target as HTMLSelectElement).value, 10);
    months = m;
    setPrescribeMonths(m);
  }

  function handleEndDateInput(e: Event) {
    const input = e.target as HTMLInputElement;
    let val = input.value.replace(/\D/g, '').substring(0, 8);
    if (val.length > 4) val = val.substring(0, 4) + '-' + val.substring(4);
    if (val.length > 7) val = val.substring(0, 7) + '-' + val.substring(7);
    input.value = val;
    endDate = val;
    setPrescribeEndDate(val);
  }

  let prescResult = $derived.by(() => {
    if (!card || !result?.valid || !result?.calculable) return null;
    const ps = getPrescribeState(activeIdx);
    const s: MedState = {
      _cardId: card._cardId,
      dose: result.dose,
      doseInterval: result.doseInterval,
      doseUnit: result.doseUnit,
      prescribedEndDateStr: result.prescribedEndDateStr,
    };
    return calcPrescribeResult(s, ps ?? null);
  });

  let hasSummary = $derived.by(() => {
    let count = 0;
    for (let i = 0; i < medCards.length; i++) {
      const c = medCards[i];
      const ps = getPrescribeState(i);
      if (!ps) continue;
      const r = getActiveResult(); // use active as approximation
      if (c && r?.valid && r?.calculable && canRenewMed({
        _cardId: c._cardId,
        valid: r.valid,
        calculable: r.calculable,
        isOveruse: r.isOveruse,
        isTooEarly: r.isTooEarly,
        earlyRenewalDecision: c.earlyRenewalDecision,
      })) {
        count++;
      }
    }
    return count >= 2;
  });
</script>

<section class="prescribe-panel" class:is-hidden={!visible && !hasSummary} aria-label="Ny förskrivning">
  <!-- Duration -->
    <div id="prescribeDuration">
      <div class="prescribe-mode-toggle">
        <button type="button" class="prescribe-mode-btn {mode === 'months' ? 'active' : ''}" data-tooltip="Välj period i hela månader." onclick={() => handleModeChange('months')}>Månader</button>
        <button type="button" class="prescribe-mode-btn {mode === 'date' ? 'active' : ''}" data-tooltip="Välj ett specifikt slutdatum för förskrivningen." onclick={() => handleModeChange('date')}>Datum</button>
      </div>
      {#if mode === 'months'}
        <div class="field">
          <label for="ps-global-months" data-tooltip="Antal månader som den nya förskrivningen ska täcka.">Förskriva i antal månader</label>
          <select id="ps-global-months" class="prescribe-select" value={months} onchange={handleMonthsChange}>
            {#each Array.from({ length: 12 }, (_, i) => i + 1) as m}
              <option value={m}>{m === 1 ? '1 månad' : `${m} månader`}</option>
            {/each}
          </select>
        </div>
      {:else}
        <div class="field">
          <label for="ps-global-enddate" data-tooltip="Sista datum som den nya förskrivningen ska täcka.">Förskriva t.o.m.</label>
          <input id="ps-global-enddate" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD" maxlength="10" autocomplete="off" value={endDate} oninput={handleEndDateInput} />
        </div>
      {/if}
    </div>

    <!-- Inner (per medication) -->
    {#if eligible && card && result}
      <div id="prescribeInner">
        <div class="prescribe-med-name">{result.medRaw || `Läkemedel ${activeIdx + 1}`}</div>

        <div class="field" style:margin-top="10px">
          <label for="ps-pkg" data-tooltip="Antal enheter per förpackning.">Förpackningsstorlek ({UNIT_DISPLAY[(result.doseUnit ?? 'st') as keyof typeof UNIT_DISPLAY]?.long ?? 'tabletter'})</label>
          <input id="ps-pkg" type="number" min="1" step="1" placeholder="T.ex. 30" value={getPrescribeState(activeIdx)?.packageSize ?? ''} oninput={handlePkgInput} />
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
          {:else if getPrescribeState(activeIdx)}
            {#each prescribeValidationHint(
              { _cardId: card._cardId, prescribedEndDateStr: result.prescribedEndDateStr },
              getPrescribeState(activeIdx) ?? null
            ) as hint}
              <div class="alert alert-{hint.type}" role="alert">{hint.msg}</div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}

    <!-- Summary -->
    {#if hasSummary}
      <div id="prescribeSummary" style:display="block">
        <div class="prescribe-summary-wrap">
          <div class="prescribe-summary-header">Sammanställning av läkemedel att förskriva</div>
          <div class="prescribe-summary-list">
            {#each medCards as c, i}
              {#if getPrescribeState(i)}
                {@const pr = calcPrescribeResult({ _cardId: c._cardId, dose: 1, doseInterval: 1, doseUnit: 'st', prescribedEndDateStr: '' }, getPrescribeState(i) ?? null)}
                <button type="button" class="prescribe-summary-row {i === activeIdx ? 'active' : ''}">
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
