<script lang="ts">
  let { error = '' }: { error?: string } = $props();
</script>

<span class="field-error-msg" class:visible={!!error} aria-live="polite">{error || ''}</span>
