/**
 * Komponentnivå-tester — kritiska UI-komponenter
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { medCards, appState, clearAllMedState, pushMedCard } from '../../src/lib/state.svelte';
import { setMockNow } from '../../src/lib/clock';
import MedCard from '../../src/components/MedCard.svelte';
import CalcResult from '../../src/components/CalcResult.svelte';
import FieldError from '../../src/components/FieldError.svelte';
import AlertDialog from '../../src/components/AlertDialog.svelte';

setMockNow(new Date('2025-05-20T00:00:00Z').getTime());

beforeEach(() => {
  clearAllMedState();
});

describe('FieldError', () => {
  it('visas inte när error är tomt', () => {
    render(FieldError, { error: '' });
    const el = screen.getByRole('alert');
    expect(el.className).not.toContain('visible');
  });

  it('visas med text när error finns', () => {
    render(FieldError, { error: 'Ogiltigt datum' });
    const el = screen.getByRole('alert');
    expect(el.className).toContain('visible');
    expect(el.textContent).toBe('Ogiltigt datum');
  });

  it('tar emot id-prop', () => {
    render(FieldError, { error: 'Fel', id: 'test-id' });
    expect(screen.getByRole('alert').id).toBe('test-id');
  });
});

describe('AlertDialog', () => {
  it('har aria-labelledby', () => {
    render(AlertDialog, { title: 'Test', message: 'Meddelande', open: false });
    const h3 = document.querySelector('.alert-dialog-title');
    expect(h3?.id).toBe('dialog-title');
  });
});

describe('MedCard', () => {
  it('renderar formulärfält för aktivt kort', () => {
    render(MedCard);
    expect(screen.getByLabelText('Läkemedel och styrka')).toBeTruthy();
    expect(screen.getByLabelText('Senaste recept')).toBeTruthy();
    expect(screen.getByLabelText('Dos (st / ml / mg)')).toBeTruthy();
    expect(screen.getByLabelText('Förpackningsstorlek')).toBeTruthy();
    expect(screen.getByLabelText('Antal uttag')).toBeTruthy();
    expect(screen.getByLabelText('Kvarvarande mängd valfritt')).toBeTruthy();
  });

  it('rensar formulär vid klick på Rensa', async () => {
    render(MedCard);
    const medInput = screen.getByLabelText('Läkemedel och styrka') as HTMLInputElement;
    medInput.value = 'Sertralin 50 mg';
    medInput.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 10));

    const rensaBtn = screen.getByText('Rensa');
    rensaBtn.click();
    await new Promise(r => setTimeout(r, 10));

    expect(medCards[0].form.medRaw).toBe('');
  });

  it('lägg till kort → nytt tomt kort', () => {
    pushMedCard();
    expect(medCards.length).toBe(2);
    expect(medCards[1].form.medRaw).toBe('');
  });
});

describe('CalcResult', () => {
  it('visar resultat när resultat är giltigt', () => {
    const result = {
      valid: true, calculable: true, statusText: 'OK',
      metrics: [{ label: 'Snittförbrukning', value: '100%', cls: 'ok', tooltip: '' }],
      alerts: [],
      tlPct: 50, tlStart: '2024-01-01', tlEnd: '2025-01-01',
      consumptionPct: 100, dose: 1, total: 365,
      doseUnit: 'st', doseInterval: 1, amt: 100,
      doseUnitLabel: 'st/dag', medRaw: 'Sertralin 50 mg',
      pDateStr: '2024-01-01', prescribedEndDateStr: '2025-01-01',
      remainingDoses: null, estimatedEndDateStr: '2025-01-01',
      daysRemaining: 0, daysToPrescribedEnd: 226,
      displayAvgStr: '1.00 st/dag', avgNote: '',
    };
    render(CalcResult, { result, nurseViewActive: false, onDecision: () => {} });
    // Metrics grid should be rendered
    const grid = document.querySelector('.result-grid');
    expect(grid).not.toBeNull();
    // Decision box should be visible
    expect(document.querySelector('.early-decision-box')).not.toBeNull();
  });

  it('visar inte resultat när resultat är ogiltigt', () => {
    const result = { valid: false, calculable: false, statusText: 'Ej ifyllt', consumptionPct: 0 };
    render(CalcResult, { result, nurseViewActive: false, onDecision: () => {} });
    // Should not render result-content (because {#if} check fails)
    expect(document.querySelector('.result-content')).toBeNull();
    // But it renders nothing due to the guard — component returns empty
  });
});
