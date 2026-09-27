<script lang="ts">
  import { caseState, setRole } from '$lib/state/case.svelte';
  import { getTheme, setView, toggleTheme, uiState, type View } from '$lib/state/ui.svelte';
  import Icon from './Icon.svelte';

  const version = __APP_VERSION__;
  const views: { id: View; label: string }[] = [
    { id: 'renew', label: 'Förnyelse' },
    { id: 'longterm', label: 'Långtidsanalys' },
  ];

  function onTabKey(e: KeyboardEvent) {
    const i = views.findIndex((v) => v.id === uiState.view);
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % views.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + views.length) % views.length;
    else return;
    e.preventDefault();
    setView(views[n].id);
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')[n]?.focus();
  }
</script>

<header class="topbar">
  <div class="brand">
    <span class="brand__name">Recept</span>
    <span class="brand__meta">{version}</span>
  </div>

  <div class="topbar__nav" role="tablist" aria-label="Huvudvyer" tabindex="-1" onkeydown={onTabKey}>
    {#each views as v (v.id)}
      <button type="button" class="nav-tab" role="tab" id="tab-{v.id}" aria-controls="view-{v.id}"
        aria-selected={uiState.view === v.id} tabindex={uiState.view === v.id ? 0 : -1}
        onclick={() => setView(v.id)}>{v.label}</button>
    {/each}
  </div>

  <div class="topbar__spacer"></div>

  <div class="topbar__controls section__row">
    {#if uiState.view === 'renew'}
      <div class="seg-group" role="group" aria-label="Roll">
        <button type="button" class="seg" aria-pressed={caseState.role === 'doctor'} onclick={() => setRole('doctor')}>Läkare</button>
        <button type="button" class="seg" aria-pressed={caseState.role === 'nurse'} onclick={() => setRole('nurse')}>Sjuksköterska</button>
      </div>
    {/if}
    <button type="button" class="btn btn--ghost" onclick={toggleTheme}
      aria-label={getTheme() === 'dark' ? 'Byt till ljust tema' : 'Byt till mörkt tema'}>
      <Icon name={getTheme() === 'dark' ? 'sun' : 'moon'} />
      {getTheme() === 'dark' ? 'Ljust' : 'Mörkt'}
    </button>
  </div>
  <span class="topbar__date">Idag {caseState.today}</span>
</header>
