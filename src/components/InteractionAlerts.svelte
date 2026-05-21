<script lang="ts">
  import type { InteractionWarning } from '$lib/interactions';

  let { warnings = [] as InteractionWarning[] } = $props();
</script>

{#if warnings.length > 0}
  <div id="interactionAlerts" aria-live="polite" aria-atomic="true">
    {#each warnings as w}
      <div class="interaction-alert interaction-{w.severity}">
        <div class="interaction-header">
          <span class="interaction-icon" aria-hidden="true">{w.severity === 'danger' ? '⚠' : '⚡'}</span>
          <strong>{w.title}</strong>
          <span class="interaction-drugs">{w.drugs.join(', ')}</span>
        </div>
        <div class="interaction-desc">{w.description}</div>
        <div class="interaction-rec">{w.recommendation}</div>
      </div>
    {/each}
  </div>
{/if}
