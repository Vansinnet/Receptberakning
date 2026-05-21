<script lang="ts">
  let { lang = 'sv' as 'sv' | 'en' } = $props();
</script>

{#if lang === 'sv'}
  <svg viewBox="0 0 22 14" width="20" height="13" aria-hidden="true" class="flag-icon"><rect width="22" height="14" fill="#006AA7"/><rect x="6" width="3" height="14" fill="#FECC02"/><rect y="5.5" width="22" height="3" fill="#FECC02"/></svg>
{:else}
  <svg viewBox="0 0 22 14" width="20" height="13" aria-hidden="true" class="flag-icon"><rect width="22" height="14" fill="#012169"/><line x1="0" y1="0" x2="22" y2="14" stroke="#FFF" stroke-width="4.5"/><line x1="22" y1="0" x2="0" y2="14" stroke="#FFF" stroke-width="4.5"/><line x1="0" y1="0" x2="22" y2="14" stroke="#C8102E" stroke-width="2"/><line x1="22" y1="0" x2="0" y2="14" stroke="#C8102E" stroke-width="2"/><rect x="8" width="6" height="14" fill="#FFF"/><rect y="4" width="22" height="6" fill="#FFF"/><rect x="9.5" width="3" height="14" fill="#C8102E"/><rect y="5.5" width="22" height="3" fill="#C8102E"/></svg>
{/if}
