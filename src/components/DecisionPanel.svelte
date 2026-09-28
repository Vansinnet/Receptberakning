<script lang="ts">
  import type { MedCard } from '$lib/types';
  import type { MedResult } from '$lib/state/case.svelte';
  import { caseState, setDecision, setPrescribePackage } from '$lib/state/case.svelte';
  import { MAX_PRESCRIBE_MONTHS, UNIT_DISPLAY } from '$lib/constants';
  import { fmtDate, fmtQty } from '$lib/utils';
  import Icon from './Icon.svelte';
  import DateField from './DateField.svelte';

  let { med, result }: { med: MedCard; result: MedResult } = $props();

  const months = Array.from({ length: MAX_PRESCRIBE_MONTHS }, (_, i) => i + 1);
  let u = $derived(UNIT_DISPLAY[med.form.unit].short);
  let renewal = $derived(result.renewal);
  let p = $derived(result.prescription);
  let daysLeft = $derived(renewal.kind === 'ok' ? renewal.daysLeft : 0);

  function onPeriod(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    med.prescribe.period = v === 'date' ? 'date' : Number(v);
  }
  function onPackage(e: Event) {
    setPrescribePackage(med.id, (e.currentTarget as HTMLInputElement).value);
  }
</script>

<section class="section" aria-labelledby="decision-title">
  <div class="section__row">
    <h2 class="section__title" id="decision-title">Beslut</h2>
    <button type="button" class="btn btn--yes" aria-pressed={med.decision === 'yes'} onclick={() => setDecision(med.id, 'yes')}>
      <Icon name="check" /> Förnya
    </button>
    <button type="button" class="btn btn--no" aria-pressed={med.decision === 'no'} onclick={() => setDecision(med.id, 'no')}>
      <Icon name="x" /> Avslå
    </button>
    <span class="hint">Beslutet är ditt. Verktyget räknar, det rekommenderar inte.</span>
  </div>

  {#if med.decision === 'yes' && renewal.kind === 'ok' && p}
    <div class="panel" aria-label="Nyförskrivning">
      {#if p.askStart}
        <div class="panel__question">
          <span id="start-q">Receptet räcker {daysLeft} dagar till. Räkna den nya perioden från</span>
          <span class="seg-group" role="radiogroup" aria-labelledby="start-q">
            <button type="button" class="seg" role="radio" aria-checked={!med.prescribe.fromToday} onclick={() => (med.prescribe.fromToday = false)}>beräknat slut</button>
            <button type="button" class="seg" role="radio" aria-checked={med.prescribe.fromToday} onclick={() => (med.prescribe.fromToday = true)}>dagens datum</button>
          </span>
        </div>
      {/if}
      <div class="presc-row">
        <div class="presc-field">
          <label class="lbl" for="p-period">Förskriv för</label>
          <select id="p-period" class="input" value={String(med.prescribe.period)} onchange={onPeriod}>
            {#each months as m (m)}<option value={String(m)}>{m} {m === 1 ? 'månad' : 'månader'}</option>{/each}
            <option value="date">Till datum</option>
          </select>
        </div>
        {#if med.prescribe.period === 'date'}
          <div class="presc-field presc-field--date">
            <label class="lbl" for="p-end">T.o.m.</label>
            <DateField id="p-end" value={med.prescribe.endDateRaw} onchange={(v) => (med.prescribe.endDateRaw = v)}
              min={caseState.today} invalid={p.kind === 'badDate'} describedby="p-msg" />
          </div>
        {/if}
        <div class="presc-field">
          <label class="lbl" for="p-pkg">Förpackning ({u})</label>
          <input id="p-pkg" class="input" type="text" inputmode="numeric" autocomplete="off"
            value={med.prescribe.packageRaw ?? med.form.packageRaw} oninput={onPackage}
            aria-invalid={p.kind === 'needPackage'} />
        </div>
        <div class="presc-result" aria-live="polite" id="p-msg">
          {#if p.kind === 'ok'}
            <span class="presc-result__big">{p.packages} förp. à {fmtQty(p.packageSize)} {u}</span>
            <span class="presc-result__detail">{fmtQty(p.units)} {u} för {p.days} dagar, {fmtDate(p.start)} – {fmtDate(p.target)}</span>
          {:else if p.kind === 'covered'}
            <span class="presc-result__big">0 förp.</span>
            <span class="presc-result__detail">{p.message}</span>
          {:else}
            <span class="presc-result__big">–</span>
            <span class="presc-result__detail fg-bad">{p.message}</span>
          {/if}
        </div>
      </div>
      {#if med.prescribe.packageRaw === null}
        <span class="hint">Förpackningsstorleken följer receptet ovan tills du ändrar den här.</span>
      {/if}
    </div>
  {/if}
</section>
