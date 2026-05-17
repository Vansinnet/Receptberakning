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
  import { canRenewMed, resetPrescribeState } from '$lib/prescribe-calc';

  let activeTab = $state<'renew' | 'longterm'>('renew');
  let theme = $state('klinisk');

  let nurseActive = $derived(getNurseViewActive());
  let result = $derived(getActiveResult());
  let activeIdx = $derived(getActiveMedIdx());
  let card = $derived(medCards[activeIdx] ?? null);

  let interactionWarnings = $derived.by(() => {
    const entries: Array<{ a: string; i: string }> = [];
    for (let i = 0; i < medCards.length; i++) {
      const c = medCards[i];
      if (c?.form?.atcCode && c.form.medRaw) {
        entries.push({ a: c.form.atcCode, i: String(c._cardId) });
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
      const ps = getPrescribeState(i);
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
    resetPrescribeState();
  }

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('pagehide', onPageHide);
      return () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pagehide', onPageHide);
      };
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
      </div>
    </footer>
  </div>
  <div class="tooltip-bubble" id="tooltipBubble"></div>
</svelte:boundary>
