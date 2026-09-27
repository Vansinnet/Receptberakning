<script lang="ts">
  import { applyDrug, caseState, getActiveMed, getResult, removeMed, setNameManually } from '$lib/state/case.svelte';
  import { loadDrugs, searchDrugs, type DrugEntry } from '$lib/drug-search';
  import { createAutocomplete } from '$lib/autocomplete.svelte';
  import { STATUS_LABEL, STATUS_TONE } from '$lib/domain/renewal';
  import { MAX_MED_NAME_LENGTH, UNIT_DISPLAY } from '$lib/constants';
  import { getFassUrl, stripManufacturer } from '$lib/utils';
  import StatusChip from './StatusChip.svelte';
  import DateField from './DateField.svelte';
  import Icon from './Icon.svelte';

  let med = $derived(getActiveMed());
  let result = $derived(med ? getResult(med.id) : undefined);
  let errors = $derived(result?.renewal.errors ?? {});

  const ac = createAutocomplete<DrugEntry>({
    searchFn: async (q) => { await loadDrugs(); return searchDrugs(q); },
    onSelect: (d) => { if (med) applyDrug(med.id, d); },
  });

  function onNameInput(e: Event) {
    if (!med) return;
    const v = (e.currentTarget as HTMLInputElement).value;
    setNameManually(med.id, v);
    ac.search(v.trim());
  }

</script>

{#if med}
  {#key med.id}
    <div class="med-head">
      <div class="med-head__main">
        <label class="lbl" for="med-name">Läkemedel och styrka</label>
        <div class="med-head__row">
          <div class="med-head__name">
            <input id="med-name" class="input input--name" type="text" autocomplete="off" spellcheck="false"
              maxlength={MAX_MED_NAME_LENGTH} placeholder="Sök, t.ex. Sertralin 50 mg"
              value={med.form.name} oninput={onNameInput} onkeydown={ac.handleKeydown} onblur={ac.handleBlur}
              role="combobox" aria-autocomplete="list" aria-expanded={ac.visible} aria-controls="ac-list"
              aria-activedescendant={ac.highlight >= 0 ? `ac-${ac.highlight}` : undefined}
              aria-invalid={!!errors.name} aria-describedby="err-name" />
            {#if ac.visible}
              <ul class="ac-dropdown" id="ac-list" role="listbox" aria-label="Förslag från läkemedelsdatabasen">
                {#each ac.results as d, i (d.nplId + d.name + (d.packageSize ?? ''))}
                  <li id="ac-{i}" class="ac-item" role="option" aria-selected={i === ac.highlight}
                    onmousedown={(e) => { e.preventDefault(); ac.select(d); }} onmouseenter={() => ac.highlightAt(i)}>
                    <span class="ac-item__name">{stripManufacturer(d.name)}</span>
                    <span class="ac-item__meta">{d.form ?? ''}{d.packageSize ? ` · ${d.packageSize} ${UNIT_DISPLAY[d.unit === 'ml' ? 'ml' : d.unit === 'dos' ? 'dos' : 'st'].short}` : ''}{d.regulation ? ` · narkotika klass ${d.regulation}` : ''}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
          {#if med.form.doseForm}<span class="med-head__form">{med.form.doseForm}</span>{/if}
          {#if med.form.regulation}<span class="chip tone-warn">Narkotika klass {med.form.regulation}</span>{/if}
          {#if med.form.name.trim()}
            <a href={getFassUrl(med.form.name, med.form.nplId)} target="_blank" rel="noopener noreferrer">FASS</a>
          {/if}
          <button type="button" class="btn btn--ghost btn--sm" onclick={() => med && removeMed(med.id)}
            aria-label="Ta bort {med.form.name || 'läkemedlet'} från ärendet">
            <Icon name="trash" size={14} /> Ta bort
          </button>
        </div>
        {#if errors.name}<div class="field-error" id="err-name">{errors.name}</div>{/if}
      </div>
      {#if result?.renewal.kind === 'ok'}
        <div class="med-head__status">
          <StatusChip large tone={STATUS_TONE[result.renewal.status]} label={STATUS_LABEL[result.renewal.status]} />
        </div>
      {/if}
    </div>

    {#if med.form.notCalculable}
      <div class="note tone-muted">
        Beredningsformen ({med.form.doseForm || 'okänd'}) lämpar sig inte för beräkning. Gör en manuell bedömning.
        Beslut och texter fungerar som vanligt, utan datum.
      </div>
    {:else}
      <section class="form-grid" aria-label="Underlag från receptet">
        <div>
          <label class="lbl" for="f-date">Receptdatum</label>
          <DateField id="f-date" value={med.form.dateRaw} onchange={(v) => { if (med) med.form.dateRaw = v; }}
            max={caseState.today} invalid={!!errors.date} describedby="err-date" />
          {#if errors.date}<div class="field-error" id="err-date">{errors.date}</div>{/if}
        </div>
        <div>
          <label class="lbl" for="f-dose">Ordinerad dos ({UNIT_DISPLAY[med.form.unit].short})</label>
          <div class="dose-row">
            <input id="f-dose" class="input input--dose" type="text" inputmode="decimal" autocomplete="off"
              bind:value={med.form.doseRaw} aria-invalid={!!errors.dose} aria-describedby="err-dose" />
            <select class="input" aria-label="Doseringsintervall" bind:value={med.form.interval}>
              <option value={1}>per dag</option>
              <option value={7}>per vecka</option>
              <option value={30}>per månad</option>
            </select>
          </div>
          {#if errors.dose}<div class="field-error" id="err-dose">{errors.dose}</div>{/if}
        </div>
        <div>
          <label class="lbl" for="f-pkg">Förpackningsstorlek</label>
          <div class="dose-row">
            <input id="f-pkg" class="input" type="text" inputmode="decimal" autocomplete="off"
              bind:value={med.form.packageRaw} aria-invalid={!!errors.package} aria-describedby="err-pkg" />
            <select class="input input--dose" aria-label="Enhet" bind:value={med.form.unit}>
              <option value="st">st</option>
              <option value="ml">ml</option>
              <option value="dos">doser</option>
            </select>
          </div>
          {#if errors.package}<div class="field-error" id="err-pkg">{errors.package}</div>{/if}
        </div>
        <div>
          <label class="lbl" for="f-refills">Antal uttag</label>
          <input id="f-refills" class="input" type="text" inputmode="numeric" autocomplete="off"
            bind:value={med.form.refillsRaw} aria-invalid={!!errors.refills} aria-describedby="err-refills" />
          {#if errors.refills}<div class="field-error" id="err-refills">{errors.refills}</div>{/if}
        </div>
        <div>
          <label class="lbl" for="f-reported">Patienten uppger kvar <span class="lbl__opt">valfritt</span></label>
          <input id="f-reported" class="input" type="text" inputmode="decimal" autocomplete="off" placeholder="Okänt"
            bind:value={med.form.reportedRaw} aria-invalid={!!errors.reported} aria-describedby="err-reported" />
          {#if errors.reported}<div class="field-error" id="err-reported">{errors.reported}</div>{/if}
        </div>
        <div>
          <label class="lbl" for="f-refills-left">Uttag kvar på receptet <span class="lbl__opt">valfritt</span></label>
          <input id="f-refills-left" class="input" type="text" inputmode="numeric" autocomplete="off" placeholder="Okänt"
            bind:value={med.form.refillsLeftRaw} aria-invalid={!!errors.refillsLeft} aria-describedby="err-refills-left" />
          {#if errors.refillsLeft}<div class="field-error" id="err-refills-left">{errors.refillsLeft}</div>{/if}
        </div>
        <p class="hint form-grid__wide">Patientens uppgift och uttag kvar påverkar aldrig beräkningen. De visas bara som jämförelse.</p>
      </section>
    {/if}
  {/key}
{:else}
  <div class="empty">Välj ett läkemedel i ärendet.</div>
{/if}

