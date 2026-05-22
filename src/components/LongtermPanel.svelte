<script lang="ts">
  import { ltPeriods, pushLtPeriod, spliceLtPeriod, resetLtPeriods, ltState, setLtPeriodField } from '$lib/state.svelte';
  import { calcLongtermCore } from '$lib/calc-longterm';
  import { pctClass, applyDateMask } from '$lib/utils';
  import { copyable } from '$lib/actions.svelte';
  import { getDrugByName } from '$lib/drug-search';
  import { MAX_LT_PERIODS, LT_BAR_TEXT_THRESHOLD_PCT } from '$lib/constants';
  import FieldError from './FieldError.svelte';
  import type { LTResult } from '$lib/types';

  let nplId = $derived(getDrugByName(ltState.medRaw)?.nplId ?? null);

  const CLASS_LABELS: Record<string, string> = { over: 'Över', under: 'Under', ok: 'OK' };

  function handleAddPeriod() {
    pushLtPeriod();
  }

  function handleRemovePeriod(idx: number) {
    spliceLtPeriod(idx);
  }

  function handleClear() {
    ltState.medRaw = '';
    ltState.doseRaw = '';
    resetLtPeriods();
  }

  function handleDateInput(field: 'start' | 'end', idx: number, e: Event) {
    applyDateMask(e.target as HTMLInputElement, (val) => {
      setLtPeriodField(idx, field, val);
    });
  }

  let ordDose = $derived.by(() => {
    const v = parseFloat(ltState.doseRaw.replace(',', '.'));
    return isNaN(v) ? 0 : v;
  });

  let doseInvalid = $derived(ltState.doseRaw !== '' && ordDose <= 0);

  let result = $derived.by((): LTResult => {
    const periods = ltPeriods.map(p => ({ start: p.start, end: p.end, total: p.total }));
    return calcLongtermCore(ltState.medRaw, ordDose, periods, nplId);
  });

  let barWidthClass = $derived(pctClass((result.barPct ?? 0) / 150 * 100, 'w'));
</script>

<div class="longterm-layout">
    <div class="card">
    <div class="card-header">
      <div class="card-header-left">
        <div class="card-num card-num-lt">📊</div>
        <span class="card-title">Långvarig förbrukningsanalys</span>
      </div>
    </div>

    <div class="longterm-body">
      <!-- LEFT: input -->
      <div class="longterm-form-col">
        <div class="info-banner-lt" role="note">
          Beräknar förbrukningsmönster över flera receptperioder. Ange en eller flera perioder med startdatum, antal uttagna enheter och slutdatum.
        </div>

        <div class="form-row-2">
          <div class="field">
            <label for="lt-med" data-tooltip="Ange läkemedelsnamn och styrka.">Läkemedel och styrka</label>
            <input id="lt-med" type="text" placeholder="T.ex. Tramadol 100 mg" maxlength="100" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" value={ltState.medRaw} oninput={(e) => ltState.medRaw = (e.target as HTMLInputElement).value} />
          </div>
          <div class="field">
            <label for="lt-dose" data-tooltip="Patientens ordinerade dygnsdos i enheter per dag.">Ordinerad dos (enheter/dag)</label>
            <input id="lt-dose" type="text" inputmode="decimal" placeholder="T.ex. 1" maxlength="10" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" value={ltState.doseRaw} oninput={(e) => ltState.doseRaw = (e.target as HTMLInputElement).value} class:input-error={doseInvalid} aria-invalid={doseInvalid} />
            <FieldError error={doseInvalid ? 'Ange ett positivt tal' : ''} />
          </div>
        </div>

        <div class="section-label">Receptperioder</div>
        <div id="lt-periods-container">
          {#each ltPeriods as period, i (i)}
            {@const pe = result.periodErrors[i]}
            <div id="lt-period-wrap-{i}">
              <div class="section-label">Period {i + 1}</div>
              <div class="form-row-3" id="lt-period-{i}">
                <div class="field">
                  <label for="lt-start-{i}" data-tooltip="Startdatum för perioden.">Startdatum</label>
                  <input id="lt-start-{i}" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD" pattern="\d{4}-\d{2}-\d{2}" maxlength="10" autocomplete="off" value={period.start} oninput={(e) => handleDateInput('start', i, e)} class:input-error={pe?.startError} aria-invalid={pe?.startError} />
                   <FieldError error={pe?.startError ? 'Ogiltigt datum' : ''} />
                </div>
                <div class="field">
                  <label for="lt-total-{i}" data-tooltip="Totalt antal enheter uttagna under perioden.">Antal uttagna enheter</label>
                  <input id="lt-total-{i}" type="number" placeholder="100" min="1" step="1" value={period.total} oninput={(e) => setLtPeriodField(i, 'total', (e.target as HTMLInputElement).value)} class:input-error={!!pe?.totalError} aria-invalid={!!pe?.totalError} />
                  <FieldError error={pe?.totalError ? 'Ange ett positivt heltal' : ''} />
                </div>
                <div class="field">
                  <label for="lt-end-{i}" data-tooltip="Slutdatum för perioden.">Slutdatum</label>
                  <input id="lt-end-{i}" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD" pattern="\d{4}-\d{2}-\d{2}" maxlength="10" autocomplete="off" value={period.end} oninput={(e) => handleDateInput('end', i, e)} class:input-error={pe?.endError} aria-invalid={pe?.endError} />
                  <FieldError error={pe?.endError ? 'Slutdatum måste vara efter startdatum och ej i framtiden' : ''} />
                </div>
              </div>
              {#if pe?.spanError}
                <FieldError error="Periodens längd är orimlig — kontrollera start- och slutdatum." />
              {/if}
              {#if i > 0}
                <button type="button" class="btn btn-ghost btn-remove-period" data-action="remove-period" data-idx={i} data-tooltip="Ta bort denna period." onclick={() => handleRemovePeriod(i)}>✕ Ta bort period {i + 1}</button>
              {/if}
            </div>
          {/each}
        </div>

        <button id="addPeriodBtn" class="btn btn-ghost btn-add-period" class:is-hidden={ltPeriods.length >= MAX_LT_PERIODS} data-tooltip="Lägg till ytterligare en period." onclick={handleAddPeriod}>＋ Lägg till period</button>

        <div class="lt-form-actions">
          <a class="btn fass-link btn-ghost" class:is-hidden={!result.valid} id="lt-fassBtn" href={result.fassUrl ?? '#'} target="_blank" rel="noopener noreferrer" data-tooltip="Öppnar FASS produktresumé.">FASS</a>
          <button id="clearLongtermBtn" class="btn btn-ghost ml-auto" data-tooltip="Rensa alla fält." onclick={handleClear}>Rensa</button>
        </div>
      </div>

      <!-- RIGHT: result -->
      <div class="longterm-result-col" class:is-hidden={!result.valid}>
        {#if result.valid}
          <!-- Result grid -->
          <div class="result-grid" id="lt-resGrid">
            <span class="rk" data-tooltip="Antal perioder som ingår i analysen.">Analyserade perioder</span>
            <span class="rv">{result.periods?.length ?? 0} st</span>
            <span class="rk" data-tooltip="Sammanlagd tid i dagar.">Total analyslängd</span>
            <span class="rv">{result.totalDays} dagar</span>
            <span class="rk" data-tooltip="Totalt antal enheter uttagna.">Totalt uttagna enheter</span>
            <span class="rv">{result.totalTablets}</span>
            <hr class="divider" />
            <span class="rk" data-tooltip="Ordinerad dygnsdos.">Ordinerad dos</span>
            <span class="rv">{ordDose} enheter/dag</span>
            <span class="rk" data-tooltip="Genomsnittlig faktisk förbrukning.">Snittförbrukning</span>
            <span class="rv">{result.avgStr ?? `${(result.overallAvg ?? 0).toFixed(2)} enheter/dag`}</span>
            <span class="rk" data-tooltip="Förbrukning i procent av ordinerad dos.">Relativt ordination</span>
            <span class="rv">{(result.consumptionPct ?? 0).toFixed(1)}%</span>
          </div>

          <!-- Overlap alert -->
          {#if result.hasOverlap}
            <div class="alert alert-warn" role="alert">
              <strong>Överlappande perioder</strong> Tidsperioderna överlappar varandra. Beräkningen använder union av datumintervall — överlappande dagar räknas inte dubbelt.
            </div>
          {/if}

          <!-- Main alert -->
          {#if result.alertType && result.alertTitle}
            <div class="alert alert-{result.alertType}" role="alert">
              <strong>{result.alertTitle}</strong> {result.alertMsg}
            </div>
          {/if}

          <!-- Bar -->
          <div id="lt-bar-section">
            <div class="section-label section-label-spaced">Förbrukning relativt ordination</div>
            <div class="consumption-bar-wrap">
              <div class="consumption-bar {result.overallStatus} {barWidthClass}" role="progressbar" aria-valuenow={Math.round(result.barPct ?? 0)} aria-valuemin="0" aria-valuemax="150" aria-label="Förbrukning relativt ordination">{((result.barPct ?? 0) > LT_BAR_TEXT_THRESHOLD_PCT ? `${(result.consumptionPct ?? 0).toFixed(0)}%` : '')}</div>
            </div>
            <div class="bar-ticks">
              <span>0%</span><span>50%</span><span>100%</span><span>150%</span>
            </div>
          </div>

          <!-- Period table -->
          {#if (result.periods?.length ?? 0) > 0}
            <div id="lt-period-table-section">
              <div class="section-label section-label-spaced">Förbrukning per period</div>
              <table class="period-table" id="lt-period-table">
                <thead>
                  <tr>
                    <th scope="col" data-tooltip="Datumintervall.">Period</th>
                    <th scope="col" class="ph-avg" data-tooltip="Genomsnittlig förbrukning per dag.">Snitt/dag</th>
                    <th scope="col" data-tooltip="Avvikelse från ordinerad dos.">Avvikelse</th>
                    <th scope="col" data-tooltip="Bedömning.">Status</th>
                  </tr>
                </thead>
                <tbody id="lt-period-rows">
                  {#each result.periods as p (p.start + '|' + p.end)}
                    <tr>
                      <td class="period-cell">{p.start} – {p.end} ({p.days}d)</td>
                      <td class="period-cell mono ph-avg">{p.avg.toFixed(2)}/dag</td>
                      <td class="period-cell mono">{p.consumptionPct >= 100 ? '+' : ''}{(p.consumptionPct - 100).toFixed(1)}%</td>
                      <td class="period-cell"><span class="badge badge-{p.classification}">{CLASS_LABELS[p.classification] ?? p.classification}</span></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          <!-- Copy section -->
          <div class="copy-section">
            <div class="copy-tabs-row">
              <span class="copy-tab" role="heading" aria-level="3">Journalanteckning (förslag)</span>
            </div>
            <div class="copy-body" id="lt-copyBody">{result.journalText ?? ''}</div>
            <div class="copy-footer">
              <button id="ltCopyBtn" class="btn btn-ghost" use:copyable={() => result.journalText ?? ''}>📋 Kopiera text</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
