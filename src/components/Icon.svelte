<script lang="ts">
  type Name = 'check' | 'clock' | 'alert' | 'x' | 'plus' | 'copy' | 'sun' | 'moon' | 'trash' | 'external' | 'calendar';
  let { name, size = 16 }: { name: Name; size?: number } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  {#if name === 'check'}
    <path d="M20 6 9 17l-5-5" />
  {:else if name === 'clock'}
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  {:else if name === 'alert'}
    <path d="M12 3 2 21h20L12 3z" /><path d="M12 10v5M12 18h.01" />
  {:else if name === 'x'}
    <path d="M18 6 6 18M6 6l12 12" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'copy'}
    <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  {:else if name === 'moon'}
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  {:else if name === 'trash'}
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  {:else if name === 'calendar'}
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
  {:else if name === 'external'}
    <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
  {/if}
</svg>
