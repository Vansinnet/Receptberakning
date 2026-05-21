// === SVELTE 5 REAKTIVT TILLSTÅNDSLAGER ===
// Re-exporterar allt för bakåtkompatibilitet.
// State är uppdelat i fem moduler:
//   form-state.svelte.ts     — formulär, validering, aktiv beräkning
//   prescribe-state.svelte.ts — förskrivar-state
//   longterm-state.svelte.ts  — långvarig förbrukning
//   cache-state.svelte.ts     — resultatcache, statuscache, getCardStatus
//   text-state.svelte.ts      — textorkestrering, prescribe-derivations

export * from './form-state.svelte';
export * from './prescribe-state.svelte';
export * from './longterm-state.svelte';
export * from './cache-state.svelte';
export * from './text-state.svelte';
