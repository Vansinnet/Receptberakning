<script lang="ts">
  // Maxdos enligt receptet (valfri). Anges i st (räknas om med uttagens styrka) eller mg, per dag
  // eller vecka. Har receptet ändrats läggs en ny maxdos till från och med ett datum.
  import { addMaxDose, getLtResult, ltState, removeMaxDose } from '$lib/state/longterm.svelte';
  import { MAX_LT_MAX_DOSES } from '$lib/constants';
  import DateField from './DateField.svelte';
  import Icon from './Icon.svelte';

  let r = $derived(getLtResult());
  let per = $derived(ltState.interval === 7 ? 'vecka' : 'dag');
  let unit = $derived(ltState.doseUnit === 'mg' ? 'mg' : ltState.noun);
</script>

<div class="lt-max" role="group" aria-labelledby="lt-max-title">
  <h3 class="lbl" id="lt-max-title">Maxdos enligt receptet <span class="lbl__opt">(valfri)</span></h3>
  {#each ltState.maxDoses as _, i (i)}
    {@const e = r.doseErrors[i] ?? {}}
    <div class="lt-max__row">
      {#if i === 0}
        <input id="lt-dose" class="input input--compact input--dose" type="text" inputmode="decimal" autocomplete="off"
          aria-label="Maxdos" bind:value={ltState.maxDoses[0].doseRaw}
          aria-invalid={!!e.dose} aria-describedby={e.dose ? 'lt-dose-err-0' : undefined} />
        <select class="input input--compact lt-max__select" aria-label="Enhet för maxdos" bind:value={ltState.doseUnit}>
          <option value="st">{ltState.noun}</option>
          <option value="mg">mg</option>
        </select>
        <span class="lt-max__per">per</span>
        <select class="input input--compact lt-max__select" aria-label="Maxdos per" bind:value={ltState.interval}>
          <option value={1}>dag</option>
          <option value={7}>vecka</option>
        </select>
      {:else}
        <span class="lt-max__per">Från och med</span>
        <div class="lt-max__date">
          <DateField compact label="Från och med, ändring {i}" value={ltState.maxDoses[i].fromRaw}
            onchange={(v) => (ltState.maxDoses[i].fromRaw = v)} invalid={!!e.from}
            describedby={e.from ? `lt-from-err-${i}` : undefined} />
        </div>
        <input class="input input--compact input--dose" type="text" inputmode="decimal" autocomplete="off"
          aria-label="Maxdos från och med, ändring {i}" bind:value={ltState.maxDoses[i].doseRaw}
          aria-invalid={!!e.dose} aria-describedby={e.dose ? `lt-dose-err-${i}` : undefined} />
        <span class="lt-max__per">{unit}/{per}</span>
        <button type="button" class="btn btn--ghost btn--icon" aria-label="Ta bort ändring {i}" onclick={() => removeMaxDose(i)}>
          <Icon name="x" size={14} />
        </button>
      {/if}
    </div>
    {#if e.from}<div class="field-error" id="lt-from-err-{i}">{e.from}</div>{/if}
    {#if e.dose}<div class="field-error" id="lt-dose-err-{i}">{e.dose}</div>{/if}
  {/each}
  {#if ltState.maxDoses[0].doseRaw.trim() && ltState.maxDoses.length < MAX_LT_MAX_DOSES}
    <div class="section__row">
      <button type="button" class="btn btn--ghost btn--sm" onclick={addMaxDose}><Icon name="plus" size={14} /> Ny maxdos från och med</button>
    </div>
  {/if}
  <p class="hint">Med maxdos visas procent av maxdosen och hur mycket som borde finnas kvar. Utan maxdos visas bara mängden per {per}.</p>
</div>
