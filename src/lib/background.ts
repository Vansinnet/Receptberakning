// Rensning när sidan lämnas.
//
// pagehide kommer både när fliken stängs och när webbläsaren lägger sidan åt sidan för att
// kunna visa den igen (bakåt-knappen, eller appbyte på mobilen). Det senare syns som
// event.persisted = true. Då rensas ingenting direkt — men kommer sidan tillbaka efter
// BACKGROUND_CLEAR_MS eller mer rensas allt. Stängs fliken på riktigt rensas allt direkt.
// På pekskärmar räknas även att sidan göms (appbyte) som bakgrund.

import { BACKGROUND_CLEAR_MS } from './constants';

export function createBackgroundGuard(onClear: () => void, now: () => number = Date.now) {
  let hiddenAt: number | null = null;
  return {
    /** Anropas vid pagehide. */
    onPageHide(e: { persisted: boolean }): void {
      if (!e.persisted) {
        hiddenAt = null;
        onClear();
        return;
      }
      hiddenAt = now();
    },
    /**
     * Anropas när sidan göms utan pagehide (visibilitychange). Används bara på pekskärmar,
     * där det betyder appbyte; på en dator är det ett vanligt flikbyte och räknas inte.
     */
    onHidden(): void {
      if (hiddenAt === null) hiddenAt = now();
    },
    /** Anropas när sidan syns igen (pageshow eller visibilitychange till synlig). */
    onReturn(): void {
      if (hiddenAt !== null && now() - hiddenAt >= BACKGROUND_CLEAR_MS) onClear();
      hiddenAt = null;
    },
  };
}
