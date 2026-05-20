<script lang="ts">
  let { error = '' }: { error?: string } = $props();
</script>

{#if error}
  <span class="field-error-msg visible" aria-live="polite">{error}</span>
{:else}
  <span class="field-error-msg"></span>
{/if}
