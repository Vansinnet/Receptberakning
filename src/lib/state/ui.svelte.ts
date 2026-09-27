// === GRÄNSSNITTETS STATE (ingen patientdata) ===
// Temat följer datorns inställning. Ett manuellt val sparas lokalt — det är det enda
// som lagras i webbläsaren.
import { THEME_STORAGE_KEY, type Theme } from '../constants';

export type View = 'renew' | 'longterm';

function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export const uiState = $state({
  view: 'renew' as View,
  stored: readStoredTheme(),
  system: systemTheme(),
});

const _theme = $derived<Theme>(uiState.stored ?? uiState.system);
export function getTheme(): Theme { return _theme; }

export function toggleTheme(): void {
  const next: Theme = _theme === 'dark' ? 'light' : 'dark';
  uiState.stored = next;
  try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* lagring otillgänglig — temat gäller ändå sessionen */ }
}

export function setView(v: View): void { uiState.view = v; }
