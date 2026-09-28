<script lang="ts">
  import { tick } from 'svelte';
  import {
    caseState, editText, getEffectiveTab, getText, getTextItems, isTextEdited, resetText, setLang, setTextTab,
  } from '$lib/state/case.svelte';
  import { COPY_CONFIRM_MS } from '$lib/constants';
  import { copyToClipboard } from '$lib/utils';
  import Icon from './Icon.svelte';

  let copied = $state<'ok' | 'fail' | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let tab = $derived(getEffectiveTab());
  let isDoctor = $derived(caseState.role === 'doctor');
  let text = $derived(getText());
  let label = $derived(tab === 'patient' ? 'Svar till patient' : 'Journalanteckning');

  async function copy() {
    const ok = await copyToClipboard(text);
    copied = ok ? 'ok' : 'fail';
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (copied = null), COPY_CONFIRM_MS);
  }

  async function onTabKey(e: KeyboardEvent) {
    if (!isDoctor || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    e.preventDefault();
    const list = e.currentTarget as HTMLElement;
    setTextTab(tab === 'patient' ? 'journal' : 'patient');
    await tick();
    list.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
  }
</script>

<aside class="texts-aside" aria-label="Texter att kopiera">
  <div class="text-tabs">
    <div class="text-tabs__list" role="tablist" aria-label="Texttyp" tabindex="-1" onkeydown={onTabKey}>
      {#if isDoctor}
        <button type="button" class="text-tab" role="tab" aria-selected={tab === 'patient'} aria-controls="text-body"
          tabindex={tab === 'patient' ? 0 : -1} onclick={() => setTextTab('patient')}>Svar till patient</button>
      {/if}
      <button type="button" class="text-tab" role="tab" aria-selected={tab === 'journal'} aria-controls="text-body"
        tabindex={tab === 'journal' ? 0 : -1} onclick={() => setTextTab('journal')}>Journalanteckning</button>
    </div>
    <div class="text-tabs__spacer"></div>
    {#if isDoctor && tab === 'patient'}
      <span class="seg-group" role="group" aria-label="Språk">
        <button type="button" class="seg seg--sm" aria-pressed={caseState.lang === 'sv'} onclick={() => setLang('sv')}>Svenska</button>
        <button type="button" class="seg seg--sm" aria-pressed={caseState.lang === 'en'} onclick={() => setLang('en')} lang="en">English</button>
      </span>
    {/if}
  </div>

  {#if getTextItems().length === 0}
    <div id="text-body" class="empty">Texterna skapas när minst ett läkemedel är ifyllt.</div>
  {:else}
    <textarea id="text-body" class="input text-area" aria-label={label} spellcheck="true"
      lang={tab === 'patient' && caseState.lang === 'en' ? 'en' : 'sv'}
      value={text} oninput={(e) => editText((e.currentTarget as HTMLTextAreaElement).value)}></textarea>
    <div class="text-actions">
      <button type="button" class="btn btn--primary" onclick={copy}><Icon name="copy" /> Kopiera</button>
      <span class="text-actions__status" role="status">
        {#if copied === 'ok'}Kopierad till urklipp{:else if copied === 'fail'}<span class="fg-bad">Kunde inte kopiera – markera texten och kopiera själv</span>{/if}
      </span>
      <span class="text-actions__spacer"></span>
      {#if isTextEdited()}
        <button type="button" class="btn btn--ghost btn--sm" onclick={resetText}>Återställ förslaget</button>
      {/if}
    </div>
    {#if isTextEdited()}
      <span class="hint">Texten är ändrad för hand och uppdateras inte när underlaget ändras.</span>
    {:else}
      <span class="hint">Texten är ett förslag. Anpassa den efter patientens situation innan du kopierar.</span>
    {/if}
  {/if}
</aside>
