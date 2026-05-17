<script lang="ts">
  import type { AlertType } from '$lib/types';
  let { type = 'info', title = '', message }: { type?: AlertType; title?: string; message: string } = $props();
</script>

<div class="alert alert-{type}" role="alert">
  {#if title}<strong>{title}</strong> {/if}{message}
</div>
