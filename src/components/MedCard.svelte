<script lang="ts">
  import { medCards, appState, getActiveValidated, clearCardPrescribeState, clearCardForm, applyPrescribeStatePatch } from '$lib/state.svelte';
  import { loadDrugs, searchDrugs, getDrugByName, type DrugEntry } from '$lib/drug-search';
  import { getFassUrl, applyDateMask, stripManufacturer } from '$lib/utils';
  import { createAutocomplete } from '$lib/autocomplete.svelte';
  import FieldError from './FieldError.svelte';

  let card = $derived(medCards[appState.activeMedIdx] ?? null);
  let validated = $derived(getActiveValidated());
  let fieldErrors = $derived(!validated.valid && validated.fieldErrors ? validated.fieldErrors : null);
  let drugEntry = $derived(getDrugByName(card?.form?.medRaw ?? ''));
  let fassUrl = $derived(getFassUrl(card?.form?.medRaw ?? '', card?.form?.nplId));

  const ac = createAutocomplete<DrugEntry>({
    searchFn: async (q) => {
      await loadDrugs();
      return searchDrugs(q);
    },
    onSelect: (d) => {
      if (!card) return;
      card.form.medRaw = d.name;
      card.form.atcCode = d.atcCode || null;
      card.form.nplId = d.nplId || null;
      card.form.notCalculable = !!d.notCalculable;
      if (d.packageSize && d.packageSize > 0) card.form.amtRaw = String(d.packageSize); else card.form.amtRaw = '';
      card.form.doseUnit = d.unit === 'ml' ? 'ml' : d.unit === 'dos' ? 'dos' : 'st';
      card.form.doseRaw = '';
      card.form.doseInterval = 1;
      card.form.leftRaw = '';
      applyPrescribeStatePatch(card._cardId, { packageSize: card.form.amtRaw, _lastAmt: card.form.amtRaw });
    },
  });

  function handleClear() {
    const idx = appState.activeMedIdx;
    if (idx >= 0 && idx < medCards.length) {
      const cardId = medCards[idx]._cardId;
      clearCardForm(cardId);
      clearCardPrescribeState(cardId);
    }
    ac.dismiss();
  }

  function handleMedInput(e: Event) {
    const q = (e.target as HTMLInputElement).value.trim();
    if (card) {
      card.form.atcCode = null;
      card.form.nplId = null;
      card.form.notCalculable = false;
    }
    ac.search(q);
  }

  let dateDisplay = $derived(card?.form?.dateVal ?? '');

  function handleDateInput(e: Event) {
    applyDateMask(e.target as HTMLInputElement, (val) => {
      if (card) card.form.dateVal = val;
    });
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
          {#if drugEntry?.regulation}
            <button type="button" class="btn btn-ghost narc-btn" disabled data-tooltip="Narkotikaklassificering enligt Läkemedelsverket.">Narkotika klass {drugEntry.regulation}</button>
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
        bind:value={card.form.medRaw} oninput={handleMedInput} onkeydown={ac.handleKeydown} onblur={ac.handleBlur}
        class:input-error={!!(fieldErrors?.medInput)}
        aria-invalid={!!(fieldErrors?.medInput)}
        role="combobox"
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls="ac-dropdown"
        aria-expanded={ac.visible}
        aria-activedescendant={ac.highlight >= 0 ? `ac-option-${ac.highlight}` : undefined}
      />
        {#if ac.visible && ac.results.length > 0}
          <div id="ac-dropdown" class="autocomplete-dropdown" role="listbox">
            {#each ac.results as d, i}
              <div id="ac-option-{i}" class="autocomplete-item {i === ac.highlight ? 'active' : ''}" role="option" tabindex="-1" aria-selected={i === ac.highlight} onmousedown={(e) => { e.preventDefault(); ac.select(d); }} onmouseenter={() => ac.highlightAt(i)}>
                <span class="ac-drug-name">{stripManufacturer(d.name)}</span>
                <span class="ac-drug-meta">{d.packageSize ?? ''} {d.unit || 'st'} · {d.form || ''}</span>
              </div>
            {/each}
          </div>
        {/if}
      <FieldError error={fieldErrors?.medInput} />
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
      <FieldError error={fieldErrors?.dateInput} />
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
        <FieldError error={fieldErrors?.doseInput} />
      </div>
      <div class="field">
        <label for="amtInput" data-tooltip="Mängd per förpackning (expediering).">Förpackningsstorlek</label>
        <input
          id="amtInput" type="number" inputmode="numeric" placeholder="100" min="1" step="1"
          bind:value={card.form.amtRaw}
          class:input-error={!!(fieldErrors?.amtInput)}
          aria-invalid={!!(fieldErrors?.amtInput)}
        />
        <FieldError error={fieldErrors?.amtInput} />
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
      <FieldError error={fieldErrors?.refInput} />
    </div>

    <div class="field field-optional">
      <label for="leftInput" data-tooltip="Patientens egna uppgifter om kvarvarande mängd.">Kvarvarande mängd <span class="optional-tag">valfritt</span></label>
      <input
        id="leftInput" type="number" inputmode="decimal" placeholder="Lämna tomt om medicinen är slut" min="0" step="any"
        bind:value={card.form.leftRaw}
        class:input-error={!!(fieldErrors?.leftInput)}
        aria-invalid={!!(fieldErrors?.leftInput)}
      />
      <FieldError error={fieldErrors?.leftInput} />
      <span class="field-hint">Ger exaktare snittberäkning om patienten uppger kvarvarande mängd</span>
    </div>
{:else}
  <div class="form-empty-state">
    <div class="empty-icon" aria-hidden="true">💊</div>
    <div>Välj ett läkemedel i listan</div>
  </div>
{/if}
