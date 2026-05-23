<script lang="ts">
  let {
    open = false,
    title = '',
    message = '',
    onConfirm = (): void => {},
    onCancel = (): void => {},
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) onCancel();
  }

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });
</script>

<dialog bind:this={dialogEl} class="alert-dialog" aria-describedby="dialog-msg" onclose={() => onCancel()} onclick={handleBackdropClick}>
  <div class="alert-dialog-content">
    <h3 class="alert-dialog-title">{title}</h3>
    <p id="dialog-msg" class="alert-dialog-msg">{message}</p>
    <div class="alert-dialog-actions">
      <button class="btn btn-ghost" onclick={() => onCancel()}>Avbryt</button>
      <button class="btn btn-danger" onclick={() => onConfirm()}>Ja, rensa</button>
    </div>
  </div>
</dialog>
