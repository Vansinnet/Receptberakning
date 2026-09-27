<script lang="ts">
  import type { Tone } from '$lib/types';
  import Icon from './Icon.svelte';

  let { tone, label, large = false }: { tone: Tone; label: string; large?: boolean } = $props();
</script>

<span class="chip tone-{tone}" class:chip--lg={large}>
  {#if tone === 'ok'}<Icon name="check" size={13} />
  {:else if tone === 'warn'}<Icon name="clock" size={13} />
  {:else if tone === 'bad'}<Icon name="alert" size={13} />{/if}
  {label}
</span>
