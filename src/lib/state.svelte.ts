// === SVELTE 5 REAKTIVT TILLSTÅNDSLAGER ===
// Re-exporterar allt för bakåtkompatibilitet.
// State är uppdelat i fyra moduler:
//   form-state.svelte.ts   — formulär, validering, aktiv beräkning
//   prescribe-state.svelte.ts — förskrivar-state
//   longterm-state.svelte.ts  — långvarig förbrukning
//   text-state.svelte.ts      — textorkestrering, cache, status

export * from './form-state.svelte';
export * from './prescribe-state.svelte';
export * from './longterm-state.svelte';
export * from './text-state.svelte';
