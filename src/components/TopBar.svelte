<script lang="ts">
  let {
    activeTab = 'renew' as 'renew' | 'longterm',
    nurseViewActive = false,
    theme = 'klinisk' as 'dark' | 'klinisk' | 'sakura',
    onTabChange = (_tab: 'renew' | 'longterm'): void => {},
    onNurseToggle = (): void => {},
    onThemeChange = (_theme: string): void => {},
  } = $props();

  const version = __APP_VERSION__;
</script>

<header class="topbar">
  <div class="topbar-brand-row">
    <span class="app-brand-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
        <rect x="3" y="2" width="14" height="18" rx="2" fill="white" fill-opacity="0.2" stroke="white" stroke-width="1.5"/>
        <line x1="6" y1="7" x2="14" y2="7" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="6" y1="10.5" x2="14" y2="10.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="6" y1="14" x2="10" y2="14" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <rect x="13.5" y="13" width="4" height="8.5" rx="1" transform="rotate(-45 13.5 13)" fill="white"/>
        <polygon points="9.5,20.5 11,19 12.5,20.5 11,22" fill="white"/>
      </svg>
    </span>
    <span class="app-brand-name">Receptberäkning</span>
    <span class="app-brand-date">{version}</span>
  </div>
  <div class="topbar-nav-row">
    <div class="main-tabs" role="tablist">
      <button class="main-tab" class:active={activeTab === 'renew'} role="tab" aria-selected={activeTab === 'renew'} aria-controls="panel-renew" data-tab="renew" data-tooltip="Beräkna förbrukning och avgör om receptet kan förnyas." onclick={() => onTabChange('renew')}>💊 Receptförnyelse</button>
      <button class="main-tab" class:active={activeTab === 'longterm'} role="tab" aria-selected={activeTab === 'longterm'} aria-controls="panel-longterm" data-tab="longterm" data-tooltip="Analysera förbrukningsmönster över flera receptperioder." onclick={() => onTabChange('longterm')}>📊 Långvarig förbrukning</button>
    </div>
    <button class="btn-nurse-toggle" aria-pressed={nurseViewActive} data-tooltip="Växla till sjuksköterskans dokumentationsvy" onclick={() => onNurseToggle()}>🩺 Sjuksköterskevy</button>
    <div class="topbar-right">
      <div class="topbar-setting">
        <label for="themeSelect" class="topbar-setting-label">Tema</label>
        <select id="themeSelect" class="theme-select" aria-label="Välj färgtema" value={theme} onchange={(e) => onThemeChange((e.target as HTMLSelectElement).value)}>
          <option value="dark">🌙 Mörkt</option>
          <option value="klinisk">🩺 Klinisk</option>
          <option value="sakura">🌸 Körsbär</option>
        </select>
      </div>
    </div>
  </div>
</header>
