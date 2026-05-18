<script lang="ts">
  import TopBar from './TopBar.svelte';
  import MedList from './MedList.svelte';
  import MedCard from './MedCard.svelte';
  import CalcResult from './CalcResult.svelte';
  import NurseView from './NurseView.svelte';
  import PrescribePanel from './PrescribePanel.svelte';
  import LongtermPanel from './LongtermPanel.svelte';
  import { medCards, getNurseViewActive, setNurseViewActive, tickCurrentDate, clearAllMedState, getActiveMedIdx, getActiveResult, getPrescribeState } from '$lib/state.svelte';
  import { CHECK_INTERACTIONS } from '$lib/interactions';
  import { canRenewMed } from '$lib/prescribe-calc';
  import { INACTIVITY_WARN_MS, INACTIVITY_COUNTDOWN_SEC, COUNTDOWN_TICK_MS, ACTIVITY_RESET_DEBOUNCE_MS } from '$lib/constants';

  let activeTab = $state<'renew' | 'longterm'>('renew');
  let theme = $state('klinisk');

  let inactivityWarnTimer: ReturnType<typeof setTimeout> | null = null;
  let inactivityCountdownTimer: ReturnType<typeof setInterval> | null = null;
  let lastActivityTs = 0;
  let inactivityCountdown = $state(INACTIVITY_COUNTDOWN_SEC);
  let showInactivityToast = $state(false);

  let nurseActive = $derived(getNurseViewActive());
  let result = $derived(getActiveResult());
  let activeIdx = $derived(getActiveMedIdx());
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
    isOveruse: result.isOveruse ?? false,
    isTooEarly: result.isTooEarly ?? false,
    earlyRenewalDecision: card.earlyRenewalDecision,
  }) : false);

  let hasSummary = $derived.by(() => {
    let count = 0;
    for (let i = 0; i < medCards.length; i++) {
      const ps = getPrescribeState(medCards[i]._cardId);
      if (!ps || !ps.packageSize) continue;
      count++;
    }
    return count >= 2;
  });

  let showPrescribe = $derived(prescribeVisible || hasSummary);

  function handleTabChange(tab: 'renew' | 'longterm') {
    activeTab = tab;
  }

  function handleNurseToggle() {
    setNurseViewActive(!nurseActive);
  }

  function handleThemeChange(t: string) {
    theme = t;
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t);
    }
  }

  function handleEarlyDecision(decision: 'yes' | 'no') {
    const idx = getActiveMedIdx();
    if (idx >= 0 && idx < medCards.length) {
      medCards[idx].earlyRenewalDecision = decision;
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

  function resetInactivityTimer() {
    if (inactivityWarnTimer) clearTimeout(inactivityWarnTimer);
    if (inactivityCountdownTimer) clearInterval(inactivityCountdownTimer);
    showInactivityToast = false;

    const hasData = medCards.some(c => c.form.medRaw !== '');
    if (!hasData) return;

    inactivityCountdown = INACTIVITY_COUNTDOWN_SEC;
    inactivityWarnTimer = setTimeout(() => {
      showInactivityToast = true;
      inactivityCountdownTimer = setInterval(() => {
        inactivityCountdown--;
        if (inactivityCountdown <= 0) {
          if (inactivityCountdownTimer) clearInterval(inactivityCountdownTimer);
          clearAllMedState();
        }
      }, COUNTDOWN_TICK_MS);
    }, INACTIVITY_WARN_MS);
  }

  function handleActivity() {
    const now = Date.now();
    if (now - lastActivityTs < ACTIVITY_RESET_DEBOUNCE_MS) return;
    lastActivityTs = now;
    resetInactivityTimer();
  }

  function dismissInactivityToast() {
    resetInactivityTimer();
  }

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('pagehide', onPageHide);
      document.addEventListener('mousemove', handleActivity);
      document.addEventListener('keydown', handleActivity);
      document.addEventListener('pointerdown', handleActivity);
      resetInactivityTimer();
      return () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pagehide', onPageHide);
        document.removeEventListener('mousemove', handleActivity);
        document.removeEventListener('keydown', handleActivity);
        document.removeEventListener('pointerdown', handleActivity);
        if (inactivityWarnTimer) clearTimeout(inactivityWarnTimer);
        if (inactivityCountdownTimer) clearInterval(inactivityCountdownTimer);
      };
    }
  });

  // Nollställ earlyRenewalDecision i medCards när flagsChanged i calcCore återställer returvärdet
  $effect(() => {
    const idx = getActiveMedIdx();
    if (!result || idx < 0 || idx >= medCards.length) return;
    if (result.earlyRenewalDecision === null && medCards[idx].earlyRenewalDecision !== null) {
      medCards[idx].earlyRenewalDecision = null;
    }
  });

  // Nollställ inaktivitetstimers när alla kort rensats
  $effect(() => {
    medCards;
    const hasData = medCards.some(c => c.form.medRaw !== '');
    if (!hasData) {
      if (inactivityWarnTimer) clearTimeout(inactivityWarnTimer);
      if (inactivityCountdownTimer) clearInterval(inactivityCountdownTimer);
      showInactivityToast = false;
    }
  });

  // Tooltip-hantering
  function showTooltip(e: Event) {
    const el = (e.target as HTMLElement).closest('[data-tooltip]');
    if (!el) return;
    const tip = el.getAttribute('data-tooltip');
    if (!tip) return;
    const bubble = document.getElementById('tooltipBubble');
    if (!bubble) return;
    const rect = el.getBoundingClientRect();
    bubble.textContent = tip;
    bubble.style.left = `${rect.left}px`;
    bubble.style.top = `${rect.bottom + 6}px`;
    bubble.classList.add('visible');
  }

  function hideTooltip() {
    document.getElementById('tooltipBubble')?.classList.remove('visible');
  }

  $effect(() => {
    if (typeof document === 'undefined') return;
    document.addEventListener('mouseover', showTooltip);
    document.addEventListener('focusin', showTooltip);
    document.addEventListener('mouseout', hideTooltip);
    document.addEventListener('focusout', hideTooltip);
    return () => {
      document.removeEventListener('mouseover', showTooltip);
      document.removeEventListener('focusin', showTooltip);
      document.removeEventListener('mouseout', hideTooltip);
      document.removeEventListener('focusout', hideTooltip);
    };
  });
</script>

<svelte:boundary>
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
      {#if activeTab === 'renew'}
        <div id="panel-renew" class="tab-panel active" role="tabpanel" aria-labelledby="heading-renew">
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
                <div id="interactionAlerts" aria-live="polite">
                  {#each interactionWarnings as w}
                    <div class="interaction-alert interaction-{w.s}">
                      <div class="interaction-header">
                        <span class="interaction-icon">{w.s === 'danger' ? '⚠' : '⚡'}</span>
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
                  onEarlyDecision={handleEarlyDecision}
                  onToggleLang={() => {}}
                />
              {:else if result && !result.valid}
                <div class="result-empty-state">
                  <div class="empty-icon">📋</div>
                  <div>{result.statusText || 'Fyll i formuläret för att se resultatet'}</div>
                </div>
              {:else if result?.valid && result?.calculable === false}
                <div class="result-empty-state">
                  <div class="empty-icon">📋</div>
                  <div>{result.verdictTitle || result.statusText || 'Kan ej beräknas'}</div>
                  {#if result.verdictSub}
                    <div class="result-verdict-sub">{result.verdictSub}</div>
                  {/if}
                </div>
              {:else}
                <div class="result-empty-state">
                  <div class="empty-icon">📋</div>
                  <div>Fyll i formuläret för att se resultatet</div>
                </div>
              {/if}
            </section>

            <!-- KOLUMN 5: Förskrivningspanel (alltid i DOM, reserverar plats) -->
            <PrescribePanel visible={showPrescribe} />
          </div>
        </div>
      {:else}
        <div id="panel-longterm" class="tab-panel active" role="tabpanel" aria-labelledby="heading-longterm">
          <h2 class="sr-only" id="heading-longterm">Långvarig förbrukningsanalys</h2>
          <LongtermPanel />
        </div>
      {/if}
    </main>

    <footer class="site-footer">
      <div class="footer-disclaimer" role="note">
        <span class="footer-disclaimer-icon">⚠</span>
        <span>Verktyget är ett beräkningshjälpmedel — förskrivaren ansvarar alltid för kliniska beslut.
          <a href="https://github.com/Vansinnet/Receptberakning/blob/main/disclaimer.md" target="_blank" rel="noopener noreferrer">Läs ansvarsfriskrivningen</a>
        </span>
      </div>
      <div class="footer-links">
        <a href="https://github.com/Vansinnet/Receptberakning/blob/main/readme.md" target="_blank" rel="noopener noreferrer">Licens och tillåtet användande</a>
        <a href="https://github.com/Vansinnet/Receptberakning" target="_blank" rel="noopener noreferrer">
          <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>
          GitHub
        </a>
      </div>
    </footer>
  </div>
  <div class="tooltip-bubble" id="tooltipBubble"></div>

  {#if showInactivityToast}
    <div class="inactivity-toast" role="alert" aria-live="assertive">
      <span class="toast-icon">⏰</span>
      <span>Inaktivitet — sessionen rensas om <strong>{inactivityCountdown}s</strong></span>
      <button class="btn btn-ghost" onclick={dismissInactivityToast}>Fortsätt</button>
    </div>
  {/if}
</svelte:boundary>
