import type { DoseInterval, DoseUnit } from './constants';

export type { DoseInterval, DoseUnit };

/** Visuell ton för status. Visas alltid med ikon och ord, aldrig bara färg. */
export type Tone = 'ok' | 'warn' | 'bad' | 'muted';

export type Decision = 'yes' | 'no' | null;

/** Sjuksköterskans bedömning i tre lägen. null = inget valt ännu (behandlas som ej bedömd). */
export type Assessment = 'normal' | 'deviating' | 'notAssessed' | null;

export type Role = 'doctor' | 'nurse';

/** Formulärets råa inmatning för ett läkemedel. Allt som skrivs in är strängar. */
export interface MedForm {
  name: string;
  atcCode: string | null;
  nplId: string | null;
  /** Beredningsform, t.ex. "Depottablett". Endast visning. */
  doseForm: string;
  /** Narkotikaklass (II–V) om preparatet är narkotikaklassat. */
  regulation: string | null;
  /** Beredningar som inte går att räkna på, t.ex. krämer. */
  notCalculable: boolean;
  unit: DoseUnit;
  dateRaw: string;
  doseRaw: string;
  interval: DoseInterval;
  packageRaw: string;
  refillsRaw: string;
  /** Patientens egen uppgift om kvarvarande mängd. Påverkar aldrig beräkningen. */
  reportedRaw: string;
  /** Uttag kvar på receptet enligt läkemedelslistan. Påverkar aldrig beräkningen. */
  refillsLeftRaw: string;
}

/** Inställningar för nyförskrivning. Ligger på läkemedlet så att allt har en enda källa. */
export interface PrescribeSettings {
  /** Antal månader från idag, eller 'date' för eget slutdatum. */
  period: number | 'date';
  endDateRaw: string;
  /** null = följer förpackningsstorleken i formuläret. */
  packageRaw: string | null;
  /** Gäller bara när frågan om startdatum visas (minst 14 dagar kvar). */
  fromToday: boolean;
}

export interface MedCard {
  id: number;
  form: MedForm;
  decision: Decision;
  prescribe: PrescribeSettings;
}

export interface LtPeriodInput {
  startRaw: string;
  endRaw: string;
  totalRaw: string;
}

/** Indata till interaktionskontrollen: ATC-kod, visningsnamn, NPL-id. */
export interface AtcEntry {
  a: string;
  i: string;
  p?: string | null;
}
