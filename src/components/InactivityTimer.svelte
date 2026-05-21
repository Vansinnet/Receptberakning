<script lang="ts">
  let { showToast = false, countdown = 0, onDismiss = (_e?: MouseEvent) => {} } = $props();
</script>

{#if showToast}
  <div class="inactivity-toast" role="alert" aria-live="assertive">
    <span class="toast-icon" aria-hidden="true">⏰</span>
    <span>Inaktivitet — sessionen rensas om <strong>{countdown}s</strong></span>
    <button class="btn btn-ghost" onclick={() => onDismiss()}>Fortsätt</button>
  </div>
{/if}
