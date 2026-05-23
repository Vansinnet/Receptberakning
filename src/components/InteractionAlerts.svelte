<script lang="ts">
  import type { InteractionWarning } from '$lib/interactions';

  let { warnings = [] as InteractionWarning[], allNplIds = [] as string[] } = $props();

  let janusmedUrl = $derived(allNplIds.length >= 2
    ? 'https://janusmed.se/interaktioner?' + allNplIds.map(id => 'nplIds=' + id).join('&')
    : '');
</script>

{#if warnings.length > 0}
  <div id="interactionAlerts" aria-live="polite" aria-atomic="true">
    {#each warnings as w (w.drugs.join('+') + '|' + w.title)}
      <div class="interaction-alert interaction-{w.severity}">
        <div class="interaction-header">
          <span class="interaction-icon" aria-hidden="true">{w.severity === 'danger' ? '⚠' : '⚡'}</span>
          <strong>{w.drugs[0]} + {w.drugs[1]}</strong>
        </div>
        <div class="interaction-inline">
          Möjlig interaktion.
          {#if janusmedUrl}
            <span> Var god se </span>
            <a class="interaction-link" href={janusmedUrl} target="_blank" rel="noopener noreferrer">samtliga kombinationer på Janusmed →</a>
          {:else if w.nplIds[0] && w.nplIds[1]}
            <span> Var god se </span>
            <a class="interaction-link" href={`https://janusmed.se/interaktioner?nplIds=${w.nplIds[0]}&nplIds=${w.nplIds[1]}`} target="_blank" rel="noopener noreferrer">kombinationen på Janusmed →</a>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}
