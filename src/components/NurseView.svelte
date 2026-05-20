<script lang="ts">
  import { appState } from '$lib/state.svelte';

  let vitalNormal = $derived(appState.nurseVitalNormal);
  let followUpAdequate = $derived(appState.nurseFollowUpAdequate);

  function toggleVital() { appState.nurseVitalNormal = !vitalNormal; }
  function toggleFollowUp() { appState.nurseFollowUpAdequate = !followUpAdequate; }
</script>

<section class="nurse-col" aria-label="Sjuksköterskebedömning">
  <div class="nurse-assessment">
    <div class="nurse-assessment-label">Sjuksköterskebedömning</div>
    <label class="nurse-checkbox" data-tooltip="Blodtryck, puls, andningsfrekvens, saturation och medvetandegrad bedöms ligga inom normala referensintervall.">
      <input type="checkbox" checked={vitalNormal} onchange={toggleVital} />
      Vitalparametrar bedöms normala
    </label>
    <label class="nurse-checkbox" data-tooltip="Patienten har erhållit planerad läkarkontakt, provtagning eller behandlingsutvärdering inom gällande vårdprograms ramar.">
      <input type="checkbox" checked={followUpAdequate} onchange={toggleFollowUp} />
      Patienten bedöms ha erhållit adekvat medicinsk uppföljning
    </label>
    <span class="nurse-hint">Din bedömning inkluderas automatiskt i journaltexten.</span>
  </div>
</section>
