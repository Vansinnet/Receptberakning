<script lang="ts">
  let { error = '', id = '' }: { error?: string; id?: string } = $props();
</script>

<span {id} class="field-error-msg" class:visible={!!error} role="alert">{error || ''}</span>
