<script lang="ts">
  // Datumfält: skriv ÅÅÅÅ-MM-DD för hand eller välj i webbläsarens kalender via knappen i fältet.
  // Kalendern är ett dolt <input type="date"> som öppnas med showPicker(). Båda vägarna ger
  // samma ÅÅÅÅ-MM-DD-sträng, så validering och beräkning är oförändrade.
  import { applyDateMask } from '$lib/utils';
  import Icon from './Icon.svelte';

  let {
    id, value, onchange, min, max, invalid = false, describedby, label, compact = false,
  }: {
    id?: string;
    value: string;
    onchange: (v: string) => void;
    min?: string;
    max?: string;
    invalid?: boolean;
    describedby?: string;
    /** aria-label när fältet saknar synlig <label for>. */
    label?: string;
    compact?: boolean;
  } = $props();

  let picker: HTMLInputElement | undefined = $state();
  let isoValue = $derived(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '');

  function onText(e: Event) {
    applyDateMask(e.currentTarget as HTMLInputElement, onchange);
  }

  function openPicker() {
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.focus();
      picker.click();
    }
  }
</script>

<div class="date-field">
  <input {id} class="input date-field__text" class:input--compact={compact} type="text" inputmode="numeric"
    autocomplete="off" maxlength="10" placeholder="ÅÅÅÅ-MM-DD" {value} oninput={onText}
    aria-label={label} aria-invalid={invalid} aria-describedby={describedby} />
  <button type="button" class="date-field__btn" onclick={openPicker}
    aria-label={label ? `Välj ${label.toLowerCase()} i kalender` : 'Välj datum i kalender'}>
    <Icon name="calendar" size={16} />
  </button>
  <input bind:this={picker} class="date-field__native" type="date" tabindex="-1" aria-hidden="true"
    value={isoValue} {min} {max} onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; if (v) onchange(v); }} />
</div>
