<script lang="ts">
  import TopBar from './TopBar.svelte';
  import CaseList from './CaseList.svelte';
  import MedEditor from './MedEditor.svelte';
  import RenewalView from './RenewalView.svelte';
  import DecisionPanel from './DecisionPanel.svelte';
  import NursePanel from './NursePanel.svelte';
  import TextPanel from './TextPanel.svelte';
  import LongtermView from './LongtermView.svelte';
  import InactivityToast from './InactivityToast.svelte';
  import { caseState, clearCase, getActiveMed, getResult, hasCaseData, refreshToday } from '$lib/state/case.svelte';
  import { clearLongterm, ltState } from '$lib/state/longterm.svelte';
  import { getTheme, uiState } from '$lib/state/ui.svelte';
  import { checkInteractions, loadInteractions, type InteractionResult } from '$lib/interactions';
  import { setDrugsLoadErrorHandler } from '$lib/drug-cache';
  import { createInactivityTimer } from '$lib/inactivity.svelte';
  import { createBackgroundGuard } from '$lib/background';

  let drugsFailed = $state(false);
  setDrugsLoadErrorHandler(() => (drugsFailed = true));

  let interactionsReady = $state(0);
  loadInteractions().then(() => interactionsReady++);

  function clearAll() {
    clearCase();
    clearLongterm();
  }

  const inactivity = createInactivityTimer(
    clearAll,
    () => hasCaseData() || !!ltState.medName || ltState.periods.some((p) => p.startRaw || p.totalRaw),
  );

  let med = $derived(getActiveMed());
  let result = $derived(med ? getResult(med.id) : undefined);

  let interactionEntries = $derived(caseState.meds
    .filter((m) => m.form.name.trim())
    .map((m) => ({ label: m.form.name.trim(), nplId: m.form.nplId })));
  let interactions = $derived.by((): InteractionResult => {
    void interactionsReady;
    return interactionEntries.length >= 2 ? checkInteractions(interactionEntries) : { warnings: [], unchecked: [] };
  });
  let nplIds = $derived(caseState.meds.map((m) => m.form.nplId).filter((x): x is string => !!x));

  $effect(() => {
    document.documentElement.setAttribute('data-theme', getTheme());
  });

  $effect(() => {
    void caseState.meds.length;
    inactivity.reset();
  });

  // Dagens datum kontrolleras varje minut, så att beräkningarna stämmer även om fliken
  // står öppen över midnatt. App monteras en gång och lever hela sessionen.
  setInterval(refreshToday, 60_000);

  const background = createBackgroundGuard(clearAll);

  function onReturn() {
    background.onReturn();
    inactivity.checkElapsed();
    refreshToday();
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') onReturn();
    else if (matchMedia('(pointer: coarse)').matches) background.onHidden();
  }
</script>

<svelte:window onpagehide={(e) => background.onPageHide(e)} onpageshow={(e) => { if (e.persisted) onReturn(); }} />
<svelte:document onvisibilitychange={onVisibility} />

<a class="skip-link" href="#main">Hoppa till innehåll</a>

<div class="app">
  {#if drugsFailed}
    <div class="banner tone-warn" role="alert">
      Läkemedelsdatabasen kunde inte laddas. Du kan fortfarande skriva in läkemedel för hand.
      <button type="button" class="btn btn--sm" onclick={() => location.reload()}>Försök igen</button>
    </div>
  {/if}

  <TopBar />

  <h1 class="sr-only">Recept – beräkningshjälpmedel vid receptförnyelse</h1>

  <div id="view-renew" role="tabpanel" aria-labelledby="tab-renew" class="workspace workspace--renew" class:is-hidden={uiState.view !== 'renew'}>
    <CaseList {interactions} {nplIds} />
    <main class="main-pane" id="main" tabindex="-1">
      <div class="renew-cols">
        <div class="renew-cols__form">
          <MedEditor />
          {#if med && result && (result.renewal.kind === 'ok' || result.renewal.kind === 'manual')}
            {#if caseState.role === 'doctor'}
              <DecisionPanel {med} {result} />
            {:else}
              <NursePanel />
            {/if}
          {/if}
        </div>
        <div class="renew-cols__result">
          {#if med && result && !med.form.notCalculable}
            <RenewalView form={med.form} renewal={result.renewal} />
          {/if}
        </div>
      </div>
    </main>
    <TextPanel />
  </div>

  <div id="view-longterm" role="tabpanel" aria-labelledby="tab-longterm" class="lt-view" class:is-hidden={uiState.view !== 'longterm'}>
    <LongtermView />
  </div>

</div>

<InactivityToast show={inactivity.showToast} countdown={inactivity.countdown} onContinue={() => inactivity.dismiss()} />
