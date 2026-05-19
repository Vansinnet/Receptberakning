<script lang="ts">
  import { ltPeriods, pushLtPeriod, spliceLtPeriod, resetLtPeriods } from '$lib/state.svelte';
  import { calcLongtermCore } from '$lib/calc-longterm';
  import type { LTResult, LTCardPeriod } from '$lib/types';

  let medRaw = $state('');
  let doseRaw = $state('');

  function handleAddPeriod() {
    pushLtPeriod();
  }

  function handleRemovePeriod(idx: number) {
    spliceLtPeriod(idx);
  }

  function handleClear() {
    medRaw = '';
    doseRaw = '';
    resetLtPeriods();
  }

  function handleDateInput(field: 'start' | 'end', idx: number, e: Event) {
    const input = e.target as HTMLInputElement;
    let val = input.value.replace(/\D/g, '').substring(0, 8);
    if (val.length > 4) val = val.substring(0, 4) + '-' + val.substring(4);
    if (val.length > 7) val = val.substring(0, 7) + '-' + val.substring(7);
    if (ltPeriods[idx]) {
      ltPeriods[idx][field] = val;
    }
  }

  let ordDose = $derived.by(() => {
    const v = parseFloat(doseRaw.replace(',', '.'));
    return isNaN(v) ? 0 : v;
  });

  let result = $derived.by((): LTResult => {
    // Läs ltPeriods för att registrera beroende
    const periods = ltPeriods.map(p => ({ start: p.start, end: p.end, total: p.total }));
    return calcLongtermCore(medRaw, ordDose, periods);
  });

  function copyLtText() {
    const text = result.journalText ?? '';
    if (text && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        ltCopied = true;
        setTimeout(() => { ltCopied = false; }, 2000);
      });
    }
  }

  let ltCopied = $state(false);
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
            <input id="lt-med" type="text" placeholder="T.ex. Tramadol 100 mg" maxlength="100" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" bind:value={medRaw} />
          </div>
          <div class="field">
            <label for="lt-dose" data-tooltip="Patientens ordinerade dygnsdos i enheter per dag.">Ordinerad dos (enheter/dag)</label>
            <input id="lt-dose" type="text" inputmode="decimal" placeholder="T.ex. 1" maxlength="10" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" bind:value={doseRaw} />
          </div>
        </div>

        <div class="section-label">Receptperioder</div>
        <div id="lt-periods-container">
          {#each ltPeriods as period, i}
            {@const pe = result.periodErrors[i]}
            <div id="lt-period-wrap-{i}">
              <div class="section-label">Period {i + 1}</div>
              <div class="form-row-3" id="lt-period-{i}">
                <div class="field">
                  <label for="lt-start-{i}" data-tooltip="Startdatum för perioden.">Startdatum</label>
                  <input id="lt-start-{i}" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD" pattern="\d{4}-\d{2}-\d{2}" maxlength="10" autocomplete="off" value={period.start} oninput={(e) => handleDateInput('start', i, e)} class:input-error={pe?.startError} aria-invalid={pe?.startError} />
                  {#if pe?.startError}
                    <span class="field-error-msg visible">Ogiltigt datum</span>
                  {:else}
                    <span class="field-error-msg"></span>
                  {/if}
                </div>
                <div class="field">
                  <label for="lt-total-{i}" data-tooltip="Totalt antal enheter uttagna under perioden.">Antal uttagna enheter</label>
                  <input id="lt-total-{i}" type="number" placeholder="100" min="1" step="1" bind:value={period.total} class:input-error={pe?.totalError || pe?.spanError} aria-invalid={pe?.totalError || pe?.spanError} />
                  {#if pe?.totalError}
                    <span class="field-error-msg visible">Ange ett positivt heltal</span>
                  {:else if pe?.spanError}
                    <span class="field-error-msg visible">Perioden är orimligt lång eller omöjlig</span>
                  {:else}
                    <span class="field-error-msg"></span>
                  {/if}
                </div>
                <div class="field">
                  <label for="lt-end-{i}" data-tooltip="Slutdatum för perioden.">Slutdatum</label>
                  <input id="lt-end-{i}" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD" pattern="\d{4}-\d{2}-\d{2}" maxlength="10" autocomplete="off" value={period.end} oninput={(e) => handleDateInput('end', i, e)} class:input-error={pe?.endError} aria-invalid={pe?.endError} />
                  {#if pe?.endError}
                    <span class="field-error-msg visible">Slutdatum måste vara efter startdatum och ej i framtiden</span>
                  {:else}
                    <span class="field-error-msg"></span>
                  {/if}
                </div>
              </div>
              {#if i > 0}
                <button type="button" class="btn btn-ghost" style:font-size="11px" style:margin-bottom="8px" data-action="remove-period" data-idx={i} data-tooltip="Ta bort denna period." onclick={() => handleRemovePeriod(i)}>✕ Ta bort period {i + 1}</button>
              {/if}
            </div>
          {/each}
        </div>

        <button id="addPeriodBtn" class="btn btn-ghost btn-add-period" data-tooltip="Lägg till ytterligare en period." onclick={handleAddPeriod}>＋ Lägg till period</button>

        <div class="lt-form-actions">
          <a class="btn fass-link btn-ghost {result.valid ? '' : 'is-hidden'}" id="lt-fassBtn" href={result.fassUrl ?? '#'} target="_blank" rel="noopener noreferrer" data-tooltip="Öppnar FASS produktresumé.">FASS</a>
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
              <div class="consumption-bar {result.overallStatus}" role="progressbar" aria-valuenow={Math.round(result.barPct ?? 0)} aria-valuemin="0" aria-valuemax="150" aria-label="Förbrukning relativt ordination" style:width="{(result.barPct ?? 0) / 150 * 100}%">{((result.barPct ?? 0) > 20 ? `${(result.consumptionPct ?? 0).toFixed(0)}%` : '')}</div>
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
                  {#each result.periods as p}
                    <tr>
                      <td class="period-cell">{p.start} – {p.end} ({p.days}d)</td>
                      <td class="period-cell mono ph-avg">{p.avg.toFixed(2)}/dag</td>
                      <td class="period-cell mono">{p.consumptionPct >= 100 ? '+' : ''}{(p.consumptionPct - 100).toFixed(1)}%</td>
                      <td class="period-cell"><span class="badge badge-{p.classification}">{p.classification === 'over' ? 'Över' : p.classification === 'under' ? 'Under' : 'OK'}</span></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          <!-- Copy section -->
          <div class="copy-section">
            <div class="copy-tabs-row">
              <div class="copy-tab">Journalanteckning (förslag)</div>
            </div>
            <div class="copy-body" id="lt-copyBody">{result.journalText ?? ''}</div>
            <div class="copy-footer">
              <button id="ltCopyBtn" class="btn btn-ghost" onclick={copyLtText}>{ltCopied ? '✅ Text kopierad till urklipp.' : '📋 Kopiera text'}</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
