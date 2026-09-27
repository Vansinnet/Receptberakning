<script lang="ts">
  import { caseState } from '$lib/state/case.svelte';
  import type { Assessment } from '$lib/types';

  const vitalOpts: { v: Exclude<Assessment, null>; label: string }[] = [
    { v: 'normal', label: 'Normala' }, { v: 'deviating', label: 'Avvikande' }, { v: 'notAssessed', label: 'Ej bedömda' },
  ];
  const followOpts: { v: Exclude<Assessment, null>; label: string }[] = [
    { v: 'normal', label: 'Adekvat' }, { v: 'deviating', label: 'Avvikande' }, { v: 'notAssessed', label: 'Ej bedömd' },
  ];
</script>

<section class="section" aria-labelledby="nurse-title">
  <h2 class="section__title" id="nurse-title">Sjuksköterskans bedömning <span class="section__sub">gäller hela ärendet</span></h2>
  <div class="assess-row">
    <span class="assess-row__label" id="vital-lbl">Vitalparametrar</span>
    <span class="seg-group" role="radiogroup" aria-labelledby="vital-lbl">
      {#each vitalOpts as o (o.v)}
        <button type="button" class="seg" role="radio" aria-checked={caseState.vital === o.v} onclick={() => (caseState.vital = o.v)}>{o.label}</button>
      {/each}
    </span>
  </div>
  <div class="assess-row">
    <span class="assess-row__label" id="follow-lbl">Medicinsk uppföljning</span>
    <span class="seg-group" role="radiogroup" aria-labelledby="follow-lbl">
      {#each followOpts as o (o.v)}
        <button type="button" class="seg" role="radio" aria-checked={caseState.followUp === o.v} onclick={() => (caseState.followUp = o.v)}>{o.label}</button>
      {/each}
    </span>
  </div>
  <span class="hint">Det som inte är valt skrivs som "har inte bedömts" i journaltexten.</span>
</section>
