<script lang="ts">
  import Icon from './Icon.svelte';
  let { show, countdown, onContinue }: { show: boolean; countdown: number; onContinue: () => void } = $props();
</script>

{#if show}
  <div class="toast" role="alertdialog" aria-labelledby="toast-msg">
    <Icon name="clock" />
    <span id="toast-msg">Ingen aktivitet – all data rensas om <strong>{countdown} sekunder</strong>.</span>
    <button type="button" class="btn btn--primary btn--sm" onclick={onContinue}>Fortsätt arbeta</button>
  </div>
{/if}
