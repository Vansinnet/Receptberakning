import { INACTIVITY_WARN_MS, INACTIVITY_COUNTDOWN_SEC, COUNTDOWN_TICK_MS, ACTIVITY_RESET_DEBOUNCE_MS } from './constants';

export function createInactivityTimer(onClear: () => void, getHasData: () => boolean) {
  let warnTimer: ReturnType<typeof setTimeout> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let lastActivityTs = 0;
  /** När nedräkningen senast startades om. Timers står still när en mobil sover. */
  let armedAt = 0;
  let showToast = $state(false);
  let countdown = $state(INACTIVITY_COUNTDOWN_SEC);

  function reset() {
    if (warnTimer) clearTimeout(warnTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    showToast = false;
    if (!getHasData()) return;
    armedAt = Date.now();
    countdown = INACTIVITY_COUNTDOWN_SEC;
    warnTimer = setTimeout(() => {
      showToast = true;
      countdownTimer = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          if (countdownTimer) clearInterval(countdownTimer);
          onClear();
        }
      }, COUNTDOWN_TICK_MS);
    }, INACTIVITY_WARN_MS);
  }

  function onActivity() {
    const now = Date.now();
    if (now - lastActivityTs < ACTIVITY_RESET_DEBOUNCE_MS) return;
    lastActivityTs = now;
    reset();
  }

  $effect(() => {
    document.addEventListener('mousemove', onActivity, { passive: true });
    document.addEventListener('keydown', onActivity);
    document.addEventListener('pointerdown', onActivity);
    return () => {
      document.removeEventListener('mousemove', onActivity);
      document.removeEventListener('keydown', onActivity);
      document.removeEventListener('pointerdown', onActivity);
      if (warnTimer) clearTimeout(warnTimer);
      if (countdownTimer) clearInterval(countdownTimer);
    };
  });

  /**
   * Anropas när sidan syns igen. På en mobil kan timers ha stått still i bakgrunden;
   * har den totala tiden utan aktivitet passerats rensas allt direkt.
   */
  function checkElapsed() {
    if (!armedAt || !getHasData()) return;
    if (Date.now() - armedAt >= INACTIVITY_WARN_MS + INACTIVITY_COUNTDOWN_SEC * 1000) {
      if (warnTimer) clearTimeout(warnTimer);
      if (countdownTimer) clearInterval(countdownTimer);
      showToast = false;
      armedAt = 0;
      onClear();
    }
  }

  return {
    get showToast() { return showToast; },
    checkElapsed,
    get countdown() { return countdown; },
    reset,
    dismiss() { reset(); },
  };
}
