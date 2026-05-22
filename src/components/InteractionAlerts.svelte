<script lang="ts">
  import type { InteractionWarning } from '$lib/interactions';

  let { warnings = [] as InteractionWarning[] } = $props();
</script>

{#if warnings.length > 0}
  <div id="interactionAlerts" class="interaction-alerts" aria-live="polite" aria-atomic="true">
    {#each warnings as w}
      <div class="interaction-row">
        <span class="interaction-text">{w.drugs[0]} + {w.drugs[1]} — {w.title} har möjlig interaktion.</span>
        <span class="interaction-janus-link">
          {#if w.nplIds[0] && w.nplIds[1]}
            <span>Se </span>
            <a href={`https://janusmed.se/interaktioner?nplIds=${w.nplIds[0]}&nplIds=${w.nplIds[1]}`} target="_blank" rel="noopener noreferrer">kombinationen på Janusmed →</a>
          {/if}
        </span>
      </div>
    {/each}
  </div>
{/if}
