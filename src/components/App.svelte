<script lang="ts">
  import TopBar from './TopBar.svelte';
  import MedList from './MedList.svelte';
  import MedCard from './MedCard.svelte';
  import CalcResult from './CalcResult.svelte';
  import NurseView from './NurseView.svelte';
  import PrescribePanel from './PrescribePanel.svelte';
  import LongtermPanel from './LongtermPanel.svelte';
  import { medCards, appState, tickCurrentDate, clearAllMedState, getActiveResult, getPrescribeState, getCardStatus, _syncCardStatus, _textsVersion, getHasSummary } from '$lib/state.svelte';
  import { CHECK_INTERACTIONS } from '$lib/interactions';
  import { canRenewMed } from '$lib/prescribe-calc';
  import { VALID_THEMES } from '$lib/constants';
  import { createInactivityTimer } from '$lib/inactivity.svelte';
  import GitHubIcon from './GitHubIcon.svelte';

  let activeTab = $state<'renew' | 'longterm'>('renew');
  let theme = $state('klinisk');

  const inactivityTimer = createInactivityTimer(
    () => clearAllMedState(),
    () => medCards.some(c => c.form.medRaw !== ''),
  );
  let showInactivityToast = $derived(inactivityTimer.showToast);
  let inactivityCountdown = $derived(inactivityTimer.countdown);

  let nurseActive = $derived(appState.nurseViewActive);
  let result = $derived(getActiveResult());
  let activeIdx = $derived(appState.activeMedIdx);
  let card = $derived(medCards[activeIdx] ?? null);

  let interactionWarnings = $derived.by(() => {
    const entries: Array<{ a: string; i: string }> = [];
    for (let i = 0; i < medCards.length; i++) {
      const c = medCards[i];
      if (c?.form?.atcCode && c.form.medRaw) {
        entries.push({ a: c.form.atcCode, i: c.form.medRaw });
      }
    }
    if (entries.length < 2) return [];
    return CHECK_INTERACTIONS(entries);
  });

  let prescribeVisible = $derived(card && result ? canRenewMed({
    _cardId: card._cardId,
    valid: result.valid ?? false,
    calculable: result.calculable ?? false,
    decision: card.decision,
  }) : false);

  let hasSummaryDerived = $derived(getHasSummary());

  let showPrescribe = $derived(prescribeVisible || hasSummaryDerived);

  function handleTabChange(tab: 'renew' | 'longterm') {
    activeTab = tab;
  }

  function handleNurseToggle() {
    appState.nurseViewActive = !nurseActive;
  }

  function handleThemeChange(t: string) {
    if (!VALID_THEMES.has(t)) return;
    theme = t;
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t);
    }
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
    if (typeof document === 'undefined') return;
    void medCards.length;
    for (const el of document.querySelectorAll('[data-tooltip]')) {
      const tip = el.getAttribute('data-tooltip');
      if (tip && !el.hasAttribute('aria-label')) {
        el.setAttribute('aria-label', tip);
      }
    }
  });

  // Notera: dessa två $effect är avsiktligt separata.
  // Sammanslagning orsakar feedback-loop (decision → _texts → _textsVersion → effect igen)
  // som triggar Svelte 5:s iterationsgräns. Se Bug 3 i bugg-dokumentationen.
  $effect(() => {
    void _textsVersion();
    void hasSummaryDerived;
    _syncCardStatus();
  });

  $effect(() => {
    void medCards.length;
    inactivityTimer.reset();
  });

  // Notera: hålls separat från _syncCardStatus-effekten ovan —
  // sammanslagning orsakar Svelte 5 feedback-loop (se Bug 3).
  $effect(() => {
    for (let i = 0; i < medCards.length; i++) {
      const status = getCardStatus(medCards[i]._cardId);
      if (status?.valid === false && medCards[i].decision !== null) {
        medCards[i].decision = null;
      }
    }
  });
</script>

<svelte:window onvisibilitychange={onVisibilityChange} onpagehide={onPageHide} />

<!-- BOUNDARY temporärt bort för felsökning -->
  <a href="#main-content" class="skip-link">Hoppa till innehåll</a>

  <noscript>
    <div class="noscript-msg" role="alert">
      <strong>JavaScript krävs.</strong> Aktivera JavaScript i din webbläsare för att använda receptberäkningsverktyget.
    </div>
  </noscript>

  <div id="a11y-announce" class="sr-only" aria-live="polite"></div>

  <div class="app-shell">
    <h1 class="sr-only">Receptberäkning – kliniskt beslutsstöd</h1>

    <TopBar {activeTab} {theme} nurseViewActive={nurseActive}
      onTabChange={handleTabChange}
      onNurseToggle={handleNurseToggle}
      onThemeChange={handleThemeChange}
    />

    <main id="main-content">
        <div id="panel-renew" class="tab-panel" class:active={activeTab === 'renew'} class:is-hidden={activeTab !== 'renew'} role="tabpanel" aria-labelledby="heading-renew">
          <h2 class="sr-only" id="heading-renew">Receptförnyelse</h2>
          <div class="renew-layout">
            <!-- KOLUMN 1: Läkemedelslista -->
            <MedList />

            <!-- KOLUMN 2: Formulär -->
            <section class="form-panel" id="formPanel" aria-label="Receptformulär">
              <MedCard />
            </section>

            <!-- KOLUMN 3: Sjuksköterskebedömning (villkorad) -->
            {#if nurseActive}
              <NurseView />
            {/if}

            <!-- KOLUMN 4: Resultat -->
            <section class="result-panel" id="resultPanel" aria-label="Beräkningsresultat">
              {#if interactionWarnings.length > 0}
                <div id="interactionAlerts" aria-live="polite" aria-atomic="true">
                  {#each interactionWarnings as w}
                    <div class="interaction-alert interaction-{w.s}">
                      <div class="interaction-header">
                        <span class="interaction-icon" aria-hidden="true">{w.s === 'danger' ? '⚠' : '⚡'}</span>
                        <strong>{w.t}</strong>
                        <span class="interaction-drugs">{w.drugs.join(', ')}</span>
                      </div>
                      <div class="interaction-desc">{w.d}</div>
                      <div class="interaction-rec">{w.r}</div>
                    </div>
                  {/each}
                </div>
              {/if}
              {#if result?.valid && result?.calculable !== false}
                <CalcResult
                  result={result}
                  nurseViewActive={nurseActive}
                  onDecision={handleEarlyDecision}
                />
              {:else if result && !result.valid}
                <div class="result-empty-state">
                  <div class="empty-icon" aria-hidden="true">📋</div>
                  <div>{result.statusText || 'Fyll i formuläret för att se resultatet'}</div>
                </div>
              {:else if result?.valid && result?.calculable === false}
                <div class="result-empty-state">
                  <div class="empty-icon" aria-hidden="true">📋</div>
                  <div>{result.statusText || 'Kan ej beräknas'}</div>
                </div>
              {:else}
                <div class="result-empty-state">
                  <div class="empty-icon" aria-hidden="true">📋</div>
                  <div>Fyll i formuläret för att se resultatet</div>
                </div>
              {/if}
            </section>

            <!-- KOLUMN 5: Förskrivningspanel (alltid i DOM, reserverar plats) -->
            <PrescribePanel visible={showPrescribe && !nurseActive} />
          </div>
        </div>

        <div id="panel-longterm" class="tab-panel" class:active={activeTab === 'longterm'} class:is-hidden={activeTab !== 'longterm'} role="tabpanel" aria-labelledby="heading-longterm">
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

  {#if showInactivityToast}
    <div class="inactivity-toast" role="alert" aria-live="assertive">
      <span class="toast-icon" aria-hidden="true">⏰</span>
      <span>Inaktivitet — sessionen rensas om <strong>{inactivityCountdown}s</strong></span>
      <button class="btn btn-ghost" onclick={() => inactivityTimer.dismiss()}>Fortsätt</button>
    </div>
  {/if}
<!-- /BOUNDARY -->
