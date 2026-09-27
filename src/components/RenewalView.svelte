<script lang="ts">
  import type { RenewalResult } from '$lib/domain/renewal';
  import { daysLeftText, STATUS_TONE } from '$lib/domain/renewal';
  import { INTERVAL_LABEL, UNIT_DISPLAY } from '$lib/constants';
  import type { MedForm, Tone } from '$lib/types';
  import { fmtDate, fmtFixed, fmtPct, fmtQty } from '$lib/utils';

  let { form, renewal }: { form: MedForm; renewal: RenewalResult } = $props();

  let u = $derived(UNIT_DISPLAY[form.unit].short);
  let per = $derived(INTERVAL_LABEL[form.interval]);

  let notes = $derived.by((): { tone: Tone; text: string }[] => {
    if (renewal.kind !== 'ok') return [];
    const out: { tone: Tone; text: string }[] = [];
    const rep = renewal.reported;
    if (rep) {
      if (rep.noConsumption) out.push({ tone: 'warn', text: 'Ingen förbrukning registrerad: patienten uppger samma mängd som förskrevs.' });
      else if (Math.abs(rep.diff) < 0.05) out.push({ tone: 'ok', text: `Patienten uppger ${fmtQty(rep.amount)} ${u} kvar, vilket stämmer med förväntat.` });
      else out.push({
        tone: rep.diff < 0 ? 'bad' : 'warn',
        text: `Patienten uppger ${fmtQty(rep.amount)} ${u} kvar: ${fmtQty(Math.abs(rep.diff))} ${u} ${rep.diff < 0 ? 'färre' : 'fler'} än förväntat, vilket motsvarar ${fmtQty(Math.abs(rep.diffDays))} dagars dos.`,
      });
    }
    const s = renewal.split;
    if (s) {
      out.push(s.homeOutSinceDays === null
        ? { tone: 'muted', text: `Av det som borde finnas kvar ligger ${fmtQty(s.atPharmacy)} ${u} på apoteket och ${fmtQty(s.atHome)} ${u} hemma.` }
        : { tone: 'warn', text: `${fmtQty(s.atPharmacy)} ${u} ligger på apoteket. Hemma borde det ha tagit slut för ${fmtQty(s.homeOutSinceDays)} dagar sedan om dosen följts.` });
    }
    return out;
  });
</script>

{#if renewal.kind === 'ok'}
  <section class="results" aria-label="Resultat">
    <div class="tiles">
      <div class="tile">
        <span class="tile__k">Räcker t.o.m.</span>
        <span class="tile__v">{fmtDate(renewal.endDate)}</span>
        <span class="tile__s tile__s--strong fg-{STATUS_TONE[renewal.status]}">{daysLeftText(renewal.daysLeft)}</span>
      </div>
      <div class="tile">
        <span class="tile__k">Borde finnas kvar idag</span>
        <span class="tile__v">{fmtQty(renewal.expectedLeft)} {u}</span>
        <span class="tile__s">av {fmtQty(renewal.total)} {u} förskrivet ({fmtQty(renewal.packageSize)} × {renewal.refills})</span>
      </div>
      <div class="tile">
        <span class="tile__k">Förbrukning om patienten har slut nu</span>
        {#if renewal.consumption}
          <span class="tile__v fg-{renewal.consumption.tone}">{fmtPct(renewal.consumption.pct)}</span>
          <span class="tile__s">{fmtFixed(renewal.consumption.perInterval, 2)} {u}/{per} mot ordinerat {form.doseRaw.trim().replace('.', ',')} {u}/{per}</span>
        {:else}
          <span class="tile__v">–</span>
          <span class="tile__s">Receptet utfärdades idag</span>
        {/if}
      </div>
    </div>

    <div class="timeline">
      <div class="timeline__track" role="img" aria-label="Dag {renewal.daysSince + 1} av {renewal.coverDays} i receptperioden">
        <div class="timeline__fill" style:width="{renewal.elapsedPct}%"></div>
        <div class="timeline__today" style:left="{renewal.elapsedPct}%"></div>
      </div>
      <div class="timeline__labels">
        <span>Receptdatum {fmtDate(renewal.prescribedDate)}</span>
        <span class="timeline__now">Idag, dag {renewal.daysSince + 1} av {renewal.coverDays}</span>
        <span>Slut {fmtDate(renewal.endDate)}</span>
      </div>
    </div>

    {#if notes.length}
      <div class="notes" aria-live="polite">
        {#each notes as n (n.text)}
          <div class="note tone-{n.tone}">{n.text}</div>
        {/each}
      </div>
    {/if}
  </section>
{:else if renewal.kind === 'incomplete'}
  <div class="empty">Fyll i {renewal.missing.join(', ')} från receptet för att se resultatet.</div>
{:else if renewal.kind === 'invalid'}
  <div class="empty">Rätta de markerade fälten för att se resultatet.</div>
{:else if renewal.kind === 'implausible'}
  <div class="note tone-bad" role="alert">{renewal.message}</div>
{:else if renewal.kind === 'empty'}
  <div class="empty">Sök fram läkemedlet eller skriv in det, och fyll sedan i uppgifterna från receptet.</div>
{/if}
