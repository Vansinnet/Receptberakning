<script lang="ts">
  // Uttagen skrivs av rad för rad ur uttagshistoriken: datum, antal och styrka.
  // Enter i antal eller styrka ger en ny rad (raderna sorteras då efter datum) och flyttar
  // fokus till dess datum. Styrkan följer raden ovanför.
  import { tick } from 'svelte';
  import { addFill, getLtResult, ltState, removeFill } from '$lib/state/longterm.svelte';
  import { caseState } from '$lib/state/case.svelte';
  import { MAX_LT_FILLS } from '$lib/constants';
  import DateField from './DateField.svelte';
  import Icon from './Icon.svelte';

  let r = $derived(getLtResult());
  let counted = $derived(r.kind === 'ok' ? r.fills.reduce((n, f) => n + f.rows.length, 0) : 0);

  async function next() {
    const i = addFill();
    if (i < 0) return;
    await tick();
    document.getElementById(`lt-date-${i}`)?.focus();
  }

  function onEnter(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    next();
  }
</script>

<div class="lt-fills" role="group" aria-labelledby="lt-fills-title">
  <div class="lt-block__head">
    <h3 class="lbl" id="lt-fills-title">Uttag ur uttagshistoriken</h3>
    {#if counted}<span class="aside-count">{counted} uttag räknas</span>{/if}
  </div>
  <div class="lt-rows">
    <span class="lt-rows__h" aria-hidden="true"></span>
    <span class="lt-rows__h" aria-hidden="true">Datum</span>
    <span class="lt-rows__h" aria-hidden="true">Antal ({ltState.noun})</span>
    <span class="lt-rows__h" aria-hidden="true">Styrka (mg)</span>
    <span class="lt-rows__h" aria-hidden="true"></span>
    {#each ltState.fills as _, i (i)}
      {@const e = r.fillErrors[i] ?? {}}
      <span class="lt-rows__no">{i + 1}</span>
      <div class="lt-rows__date">
        <DateField compact id="lt-date-{i}" label="Datum, uttag {i + 1}" value={ltState.fills[i].dateRaw}
          onchange={(v) => (ltState.fills[i].dateRaw = v)} max={caseState.today} invalid={!!e.date}
          describedby={e.date ? `lt-date-err-${i}` : undefined} />
        {#if e.date}<div class="field-error" id="lt-date-err-{i}">{e.date}</div>{/if}
      </div>
      <div class="lt-rows__count">
        <input class="input input--compact" id="lt-count-{i}" type="text" inputmode="numeric" autocomplete="off"
          aria-label="Antal, uttag {i + 1}" placeholder="antal" bind:value={ltState.fills[i].countRaw} onkeydown={onEnter}
          aria-invalid={!!e.count} aria-describedby={e.count ? `lt-count-err-${i}` : undefined} />
        {#if e.count}<div class="field-error" id="lt-count-err-{i}">{e.count}</div>{/if}
      </div>
      <div class="lt-rows__strength">
        <input class="input input--compact" type="text" inputmode="decimal" autocomplete="off"
          aria-label="Styrka i mg, uttag {i + 1}" placeholder="mg" bind:value={ltState.fills[i].strengthRaw} onkeydown={onEnter}
          aria-invalid={!!e.strength} aria-describedby={e.strength ? `lt-str-err-${i}` : undefined} />
        {#if e.strength}<div class="field-error" id="lt-str-err-{i}">{e.strength}</div>{/if}
      </div>
      <button type="button" class="btn btn--ghost btn--icon lt-rows__del" aria-label="Ta bort uttag {i + 1}" onclick={() => removeFill(i)}>
        <Icon name="x" size={14} />
      </button>
    {/each}
  </div>
  <div class="section__row">
    {#if ltState.fills.length < MAX_LT_FILLS || ltState.fills.some((f) => !f.dateRaw.trim() && !f.countRaw.trim())}
      <button type="button" class="btn btn--ghost btn--sm" onclick={next}><Icon name="plus" size={14} /> Lägg till uttag</button>
    {/if}
    <span class="hint">Enter ger en ny rad. Antal kan skrivas som 2x30.</span>
  </div>
</div>
