<script lang="ts">
  import type { InteractionWarning } from '$lib/interactions';

  let { warnings = [] as InteractionWarning[] } = $props();

  let janusmedUrl = $derived.by(() => {
    const ids = new Set<string>();
    for (const w of warnings) {
      if (w.nplIds[0]) ids.add(w.nplIds[0]);
      if (w.nplIds[1]) ids.add(w.nplIds[1]);
    }
    if (ids.size < 2) return null;
    const params = [...ids].map(id => `nplIds=${id}`).join('&');
    return `https://janusmed.se/interaktioner?${params}`;
  });
</script>

{#if warnings.length > 0}
  <div id="interactionAlerts" aria-live="polite" aria-atomic="true">
    {#each warnings as w}
      <div class="interaction-alert interaction-{w.severity}">
        <div class="interaction-header">
          <span class="interaction-icon" aria-hidden="true">{w.severity === 'danger' ? '⚠' : '⚡'}</span>
          <strong>{w.title}</strong>
          <span class="interaction-drugs">{w.drugs.join(' + ')}</span>
        </div>
        {#if janusmedUrl}
          <a class="interaction-janusmed-link" href={janusmedUrl} target="_blank" rel="noopener noreferrer">→ Kontrollera på Janusmed</a>
        {/if}
      </div>
    {/each}
  </div>
{/if}
