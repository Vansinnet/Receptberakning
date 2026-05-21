<script lang="ts">
  let {
    open = false,
    title = '',
    message = '',
    onConfirm = (): void => {},
    onCancel = (): void => {},
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });
</script>

<dialog bind:this={dialogEl} class="alert-dialog" onclose={() => onCancel()} onclick={(e) => { if (e.target === dialogEl) onCancel(); }}>
  <div class="alert-dialog-content">
    <h3 class="alert-dialog-title">{title}</h3>
    <p class="alert-dialog-msg">{message}</p>
    <div class="alert-dialog-actions">
      <button class="btn btn-ghost" onclick={() => onCancel()}>Avbryt</button>
      <button class="btn btn-danger" onclick={() => onConfirm()}>Ja, rensa</button>
    </div>
  </div>
</dialog>
