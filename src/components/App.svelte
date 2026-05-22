<script lang="ts">
  import TopBar from './TopBar.svelte';
  import MedList from './MedList.svelte';
  import MedCard from './MedCard.svelte';
  import CalcResult from './CalcResult.svelte';
  import NurseView from './NurseView.svelte';
  import PrescribePanel from './PrescribePanel.svelte';
  import LongtermPanel from './LongtermPanel.svelte';
  import InteractionAlerts from './InteractionAlerts.svelte';
  import InactivityTimer from './InactivityTimer.svelte';
  import { medCards, appState, tickCurrentDate, clearAllMedState, getActiveResult, _syncCardStatus, getHasSummary } from '$lib/state.svelte';
  import { CHECK_INTERACTIONS } from '$lib/interactions';
  import { canRenewMed } from '$lib/prescribe-calc';
  import { VALID_THEMES } from '$lib/constants';
  import { createInactivityTimer } from '$lib/inactivity.svelte';
  import GitHubIcon from './GitHubIcon.svelte';

  let activeTab = $state<'renew' | 'longterm'>('renew');
  let theme = $state<'dark' | 'klinisk' | 'sakura'>('klinisk');

  const inactivityTimer = createInactivityTimer(
    () => clearAllMedState(),
    () => medCards.some(c => c.form.medRaw !== ''),
  );
  let card = $derived(medCards[appState.activeMedIdx] ?? null);
  let result = $derived(getActiveResult());

  let interactionWarnings = $derived.by(() => {
    const entries: Array<{ a: string; i: string; p: string | null }> = [];
    for (let i = 0; i < medCards.length; i++) {
      const c = medCards[i];
      if (c?.form?.atcCode && c.form.medRaw) {
        entries.push({ a: c.form.atcCode, i: c.form.medRaw, p: c.form.nplId });
      }
    }
    if (entries.length < 2) return [];
    return CHECK_INTERACTIONS(entries);
  });

  let prescribeVisible = $derived.by(() => {
    const r = getActiveResult();
    return card && r ? canRenewMed({
      _cardId: card._cardId,
      valid: r.valid ?? false,
      calculable: r.calculable ?? false,
      decision: card.decision,
    }) : false;
  });

  let showPrescribe = $derived(prescribeVisible || getHasSummary());

  function handleTabChange(tab: 'renew' | 'longterm') {
    activeTab = tab;
  }

  function handleNurseToggle() {
    appState.nurseViewActive = !appState.nurseViewActive;
  }

  function handleThemeChange(t: string) {
    if (!VALID_THEMES.has(t)) return;
    theme = t as 'dark' | 'klinisk' | 'sakura';
  }

  function handleEarlyDecision(decision: 'yes' | 'no') {
    const idx = appState.activeMedIdx;
    if (idx >= 0 && idx < medCards.length) {
      medCards[idx].decision = decision;
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      tickCurrentDate();
    }
  }

  function onPageHide() {
    clearAllMedState();
  }

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  });

  $effect(() => {
    _syncCardStatus();
  });

  $effect(() => {
    void medCards.length;
    inactivityTimer.reset();
  });
</script>

<svelte:window onvisibilitychange={onVisibilityChange} onpagehide={onPageHide} />

  <a href="#main-content" class="skip-link">Hoppa till innehåll</a>

  <noscript>
    <div class="noscript-msg" role="alert">
      <strong>JavaScript krävs.</strong> Aktivera JavaScript i din webbläsare för att använda receptberäkningsverktyget.
    </div>
  </noscript>

  <div id="a11y-announce" class="sr-only" aria-live="polite"></div>

  <div class="app-shell">
    <h1 class="sr-only">Receptberäkning – kliniskt beslutsstöd</h1>

    <TopBar {activeTab} {theme} nurseViewActive={appState.nurseViewActive}
      onTabChange={handleTabChange}
      onNurseToggle={handleNurseToggle}
      onThemeChange={handleThemeChange}
    />

    <main id="main-content">
        <div id="panel-renew" class="tab-panel" class:active={activeTab === 'renew'} role="tabpanel" aria-labelledby="heading-renew">
          <h2 class="sr-only" id="heading-renew">Receptförnyelse</h2>
          <div class="renew-layout">
            <!-- KOLUMN 1: Läkemedelslista -->
            <MedList />

            <!-- KOLUMN 2: Formulär -->
            <section class="form-panel" id="formPanel" aria-label="Receptformulär">
              <MedCard />
            </section>

            <!-- KOLUMN 3: Sjuksköterskebedömning (villkorad) -->
            {#if appState.nurseViewActive}
              <NurseView />
            {/if}

            <!-- KOLUMN 4: Resultat -->
            <section class="result-panel" id="resultPanel" aria-label="Beräkningsresultat">
              <InteractionAlerts warnings={interactionWarnings} />
              {#if result?.valid && result?.calculable !== false}
                <CalcResult
                  result={result}
                  nurseViewActive={appState.nurseViewActive}
                  onDecision={handleEarlyDecision}
                />
              {:else}
                <div class="result-empty-state">
                  <div class="empty-icon" aria-hidden="true">📋</div>
                  <div>{result?.statusText || 'Fyll i formuläret för att se resultatet'}</div>
                </div>
              {/if}
            </section>

            <!-- KOLUMN 5: Förskrivningspanel (alltid i DOM, reserverar plats) -->
            <PrescribePanel visible={showPrescribe && !appState.nurseViewActive} />
          </div>
        </div>

        <div id="panel-longterm" class="tab-panel" class:active={activeTab === 'longterm'} role="tabpanel" aria-labelledby="heading-longterm">
          <h2 class="sr-only" id="heading-longterm">Långvarig förbrukningsanalys</h2>
          <LongtermPanel />
        </div>
    </main>

    <footer class="site-footer">
      <div class="footer-disclaimer" role="note">
        <span class="footer-disclaimer-icon" aria-hidden="true">⚠</span>
        <span>Verktyget är ett beräkningshjälpmedel — förskrivaren ansvarar alltid för kliniska beslut.
          <a href="https://github.com/Vansinnet/Receptberakning/blob/main/disclaimer.md" target="_blank" rel="noopener noreferrer">Läs ansvarsfriskrivningen</a>
        </span>
      </div>
      <div class="footer-links">
        <a href="https://github.com/Vansinnet/Receptberakning/blob/main/readme.md" target="_blank" rel="noopener noreferrer">Licens och tillåtet användande</a>
        <a href="https://github.com/Vansinnet/Receptberakning" target="_blank" rel="noopener noreferrer">
          <GitHubIcon />
          GitHub
        </a>
      </div>
    </footer>
  </div>

  <InactivityTimer showToast={inactivityTimer.showToast} countdown={inactivityTimer.countdown} onDismiss={() => inactivityTimer.dismiss()} />
