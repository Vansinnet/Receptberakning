<script lang="ts">
  import { medCards, getActiveMedIdx, getActiveValidated, clearCardPrescribeState } from '$lib/state.svelte';
  import { loadDrugs, searchDrugs, getDrugByName, type DrugEntry } from '$lib/drug-search';
  import { getFassUrl } from '$lib/utils';
  import { MIN_SEARCH_QUERY_LENGTH } from '$lib/constants';

  let activeIdx = $derived(getActiveMedIdx());
  let card = $derived(medCards[activeIdx] ?? null);
  let validated = $derived(getActiveValidated());
  let fieldErrors = $derived(!validated.valid && validated.fieldErrors ? validated.fieldErrors : null);
  let drugEntry = $derived(getDrugByName(card?.form?.medRaw ?? ''));
  let fassUrl = $derived(getFassUrl(card?.form?.medRaw ?? '', card?.form?.nplId));

  // Autocomplete state
  let acResults = $state<DrugEntry[]>([]);
  let acVisible = $state(false);
  let acHighlight = $state(-1);
  let acSearchSeq = 0;

  function handleClear() {
    const idx = getActiveMedIdx();
    if (idx >= 0 && idx < medCards.length) {
      const cardId = medCards[idx]._cardId;
      medCards[idx].form = {
        medRaw: '', dateVal: '', doseRaw: '', amtRaw: '', refRaw: '', leftRaw: '',
        doseUnit: 'st', doseInterval: 1, notCalculable: false,
        atcCode: null, nplId: null,
      };
      medCards[idx].decision = null;
      clearCardPrescribeState(cardId);
    }
    acVisible = false;
    acResults = [];
  }

  async function handleMedInput(e: Event) {
    const q = (e.target as HTMLInputElement).value.trim();
    acSearchSeq++;
    const seq = acSearchSeq;

    if (card) {
    card.form.atcCode = null;
    card.form.nplId = null;
    card.form.notCalculable = false;
    card.form.amtRaw = '';
    card.form.doseUnit = 'st';
    card.form.doseRaw = '';
    card.form.doseInterval = 1;
    card.form.leftRaw = '';
    }

    if (q.length < MIN_SEARCH_QUERY_LENGTH) {
      acResults = [];
      acVisible = false;
      acHighlight = -1;
      return;
    }
    await loadDrugs();
    if (seq !== acSearchSeq) return;
    const results = searchDrugs(q);
    if (seq !== acSearchSeq) return;
    acResults = results;
    acVisible = results.length > 0;
    acHighlight = -1;
  }

  function selectDrug(d: DrugEntry) {
    if (!card) return;
    card.form.medRaw = d.n;
    card.form.atcCode = d.a || null;
    card.form.nplId = d.i || null;
    card.form.notCalculable = !!d.c;
    if (d.p && d.p > 0) card.form.amtRaw = String(d.p);
    card.form.doseUnit = d.u === 'ml' ? 'ml' : d.u === 'dos' ? 'dos' : 'st';
    acVisible = false;
    acResults = [];
  }

  function handleAcKeydown(e: KeyboardEvent) {
    if (!acVisible) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      acHighlight = Math.min(acHighlight + 1, acResults.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      acHighlight = acHighlight >= 0 ? Math.max(acHighlight - 1, 0) : -1;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (acHighlight >= 0 && acHighlight < acResults.length) {
        selectDrug(acResults[acHighlight]);
      }
    } else if (e.key === 'Escape') {
      acVisible = false;
      acResults = [];
    }
  }

  function handleBlur() {
    if (blurTimeout) clearTimeout(blurTimeout);
    blurTimeout = setTimeout(() => {
      acVisible = false;
      acResults = [];
      blurTimeout = null;
    }, 150);
  }

  let blurTimeout: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    return () => {
      if (blurTimeout) clearTimeout(blurTimeout);
    };
  });

  let dateDisplay = $derived(card?.form?.dateVal ?? '');

  function handleDateInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const originalVal = input.value;
    let val = originalVal.replace(/\D/g, '').substring(0, 8);
    if (val.length > 4) val = val.substring(0, 4) + '-' + val.substring(4);
    if (val.length > 7) val = val.substring(0, 7) + '-' + val.substring(7);
    const sel = input.selectionStart ?? 0;
    const digitsBefore = originalVal.substring(0, sel).replace(/\D/g, '').length;
    if (card) card.form.dateVal = val;
    if (val !== originalVal) {
      let newPos = 0, count = 0;
      for (let i = 0; i < val.length; i++) {
        if (/\d/.test(val[i])) count++;
        if (count === digitsBefore) { newPos = i + 1; break; }
      }
      if (count < digitsBefore) newPos = val.length;
      const target = newPos;
      requestAnimationFrame(() => {
        try { input.setSelectionRange(target, target); } catch (_) {}
      });
    }
  }

</script>

{#if card}
    <div class="form-panel-header">
      <div>
        <div class="form-med-name">{card.form.medRaw || '—'}</div>
      </div>
      <div class="form-panel-actions">
        {#if card.form.medRaw}
          <a class="btn btn-ghost fass-link" href={fassUrl} target="_blank" rel="noopener noreferrer" data-tooltip="Öppnar FASS produktresumé för detta läkemedel i ny flik.">FASS</a>
          {#if drugEntry?.r}
            <button type="button" class="btn btn-ghost narc-btn" disabled data-tooltip="Narkotikaklassificering enligt Läkemedelsverket.">Narkotika klass {drugEntry.r}</button>
          {/if}
        {/if}
        <button class="btn btn-ghost" data-tooltip="Rensa formuläret för detta läkemedel." onclick={handleClear}>Rensa</button>
      </div>
    </div>

    <div class="field">
      <label for="medInput" data-tooltip="Ange läkemedelsnamn och styrka exakt som på receptet.">Läkemedel och styrka</label>
      <input
        id="medInput" type="text" placeholder="T.ex. Sertralin 50 mg" maxlength="100"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        bind:value={card.form.medRaw} oninput={handleMedInput} onkeydown={handleAcKeydown} onblur={handleBlur}
        class:input-error={!!(fieldErrors?.medInput)}
        aria-invalid={!!(fieldErrors?.medInput)}
        role="combobox"
        aria-autocomplete="list"
        aria-controls="ac-dropdown"
        aria-expanded={acVisible}
        aria-activedescendant={acHighlight >= 0 ? `ac-option-${acHighlight}` : undefined}
      />
        {#if acVisible && acResults.length > 0}
          <div id="ac-dropdown" class="autocomplete-dropdown" role="listbox">
            {#each acResults as d, i}
              <div id="ac-option-{i}" class="autocomplete-item {i === acHighlight ? 'active' : ''}" role="option" tabindex="-1" aria-selected={i === acHighlight} onmousedown={(e) => { e.preventDefault(); selectDrug(d); }} onmouseenter={() => acHighlight = i}>
                <span class="ac-drug-name">{d.n}</span>
                <span class="ac-drug-meta">{d.p ?? ''} {d.u || 'st'} · {d.f || ''}</span>
              </div>
            {/each}
          </div>
        {/if}
      {#if fieldErrors?.medInput}
        <span class="field-error-msg visible" aria-live="polite">{fieldErrors.medInput}</span>
      {:else}
        <span class="field-error-msg"></span>
      {/if}
    </div>

    <div class="field">
      <label for="dateInput" data-tooltip="Förskrivningsdatum för det senaste receptet.">Senaste recept</label>
      <input
        id="dateInput" type="text" inputmode="numeric" placeholder="ÅÅÅÅ-MM-DD"
        pattern="\d{4}-\d{2}-\d{2}" maxlength="10"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        value={dateDisplay} oninput={handleDateInput}
        class:input-error={!!(fieldErrors?.dateInput)}
        aria-invalid={!!(fieldErrors?.dateInput)}
      />
      {#if fieldErrors?.dateInput}
        <span class="field-error-msg visible" aria-live="polite">{fieldErrors.dateInput}</span>
      {:else}
        <span class="field-error-msg"></span>
      {/if}
    </div>

    <div class="form-row-2 form-row-2-uneven">
      <div class="field">
        <label for="doseInput" data-tooltip="Ordinerad dos per vald tidsperiod.">Dos (st / ml / mg)</label>
        <div class="dose-input-row">
          <input
            id="doseInput" type="text" inputmode="decimal" placeholder="1" maxlength="10"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            bind:value={card.form.doseRaw}
            class:input-error={!!(fieldErrors?.doseInput)}
            aria-invalid={!!(fieldErrors?.doseInput)}
          />
          <select id="doseIntervalSelect" aria-label="Tidsperiod för dos" bind:value={card.form.doseInterval}>
            <option value={1}>per dag</option>
            <option value={7}>per vecka</option>
            <option value={30}>per månad</option>
          </select>
        </div>
        {#if fieldErrors?.doseInput}
          <span class="field-error-msg visible" aria-live="polite">{fieldErrors.doseInput}</span>
        {:else}
          <span class="field-error-msg"></span>
        {/if}
      </div>
      <div class="field">
        <label for="amtInput" data-tooltip="Mängd per förpackning (expediering).">Förpackningsstorlek</label>
        <input
          id="amtInput" type="number" inputmode="numeric" placeholder="100" min="1" step="1"
          bind:value={card.form.amtRaw}
          class:input-error={!!(fieldErrors?.amtInput)}
          aria-invalid={!!(fieldErrors?.amtInput)}
        />
        {#if fieldErrors?.amtInput}
          <span class="field-error-msg visible" aria-live="polite">{fieldErrors.amtInput}</span>
        {:else}
          <span class="field-error-msg"></span>
        {/if}
      </div>
    </div>

    <div class="field">
      <label for="refInput" data-tooltip="Antal tillåtna uthämtningar på receptet. Max 12 uttag stöds.">Antal uttag</label>
      <input
        id="refInput" type="number" inputmode="numeric" placeholder="T.ex. 3" min="1" max="12" step="1"
        bind:value={card.form.refRaw}
        class:input-error={!!(fieldErrors?.refInput)}
        aria-invalid={!!(fieldErrors?.refInput)}
      />
      {#if fieldErrors?.refInput}
        <span class="field-error-msg visible" aria-live="polite">{fieldErrors.refInput}</span>
      {:else}
        <span class="field-error-msg"></span>
      {/if}
    </div>

    <div class="field field-optional">
      <label for="leftInput" data-tooltip="Patientens egna uppgifter om kvarvarande mängd.">Kvarvarande mängd <span class="optional-tag">valfritt</span></label>
      <input
        id="leftInput" type="number" inputmode="decimal" placeholder="Lämna tomt om medicinen är slut" min="0" step="any"
        bind:value={card.form.leftRaw}
        class:input-error={!!(fieldErrors?.leftInput)}
        aria-invalid={!!(fieldErrors?.leftInput)}
      />
      {#if fieldErrors?.leftInput}
        <span class="field-error-msg visible" aria-live="polite">{fieldErrors.leftInput}</span>
      {:else}
        <span class="field-error-msg"></span>
      {/if}
      <span class="field-hint">Ger exaktare snittberäkning om patienten uppger kvarvarande mängd</span>
    </div>
{:else}
  <div class="form-empty-state">
    <div class="empty-icon" aria-hidden="true">💊</div>
    <div>Välj ett läkemedel i listan</div>
  </div>
{/if}
