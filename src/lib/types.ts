// === Kliniska typer ===

export type DoseUnit = 'st' | 'ml' | 'dos';
export type DoseInterval = 1 | 7 | 30;
export type AlertType = 'danger' | 'warn' | 'info' | 'ok';

// === Validering ===

export interface FieldErrors {
  medInput: string;
  dateInput: string;
  doseInput: string;
  amtInput: string;
  refInput: string;
  leftInput: string;
}

export interface ValidatedInput {
  valid: true;
  medRaw: string;
  dateVal: string;
  pDate: Date;
  amt: number;
  dose: number;
  ref: number;
  remaining: number | null;
  doseRaw: string;
  amtRaw: string;
  refRaw: string;
  leftRaw: string;
  doseInterval: DoseInterval;
  doseUnit: DoseUnit;
  notCalculable: boolean;
}

export interface InvalidInput {
  valid: false;
  reason: 'incomplete' | 'invalid_date' | 'too_many_refs';
  fieldErrors?: FieldErrors;
}

export type CalcInput = ValidatedInput | InvalidInput;

// === Beräkningsresultat ===

export interface CalcAlert {
  type: AlertType;
  title: string;
  message: string;
}

export interface CalcMetric {
  label: string;
  value: string;
  cls: string;
  tooltip: string;
}

export interface CalcResult {
  valid: boolean;
  calculable?: boolean;
  statusText: string;
  metrics?: CalcMetric[];
  alerts?: CalcAlert[];
  tlPct?: number;
  tlStart?: string;
  tlEnd?: string;
  medRaw?: string;
  amt?: number;
  dose?: number;
  doseInterval?: DoseInterval;
  doseUnit?: DoseUnit;
  doseUnitLabel?: string;
  pDateStr?: string;
  total?: number;
  remainingDoses?: number | null;
  estimatedEndDateStr?: string;
  prescribedEndDateStr?: string;
  daysRemaining?: number;
  daysToPrescribedEnd?: number;
  displayAvgStr?: string;
  avgNote?: string;
  consumptionPct: number;
  patientText?: string;
  patientTextEn?: string;
  journalText?: string;
}

// === State ===

export interface FormValues {
  medRaw: string;
  dateVal: string;
  doseRaw: string;
  amtRaw: string;
  refRaw: string;
  leftRaw: string;
  doseUnit: DoseUnit;
  doseInterval: DoseInterval;
  notCalculable: boolean;
  atcCode: string | null;
  nplId: string | null;
}

export interface MedCard {
  _cardId: number;
  form: FormValues;
  decision: 'yes' | 'no' | null;
  activeTab: 'patient' | 'journal';
  patientLang: 'sv' | 'en';
}

export type CardStatusCache = {
  valid: boolean;
  calculable: boolean;
  statusText: string;
  consumptionPct: number;
  daysToPrescribedEnd: number;
  prescribedEndDateStr: string;
};

export interface CardResult {
  cardId: number;
  calc: CalcResult;
  medNameStripped: string;
}

export interface PrescribeEntry {
  packageSize: string;
  _lastAmt?: string;
  mode?: string;
  months?: number;
  endDate?: string;
  startFromToday?: boolean;
}

export interface PrescribeInput {
  _cardId: number;
  dose?: number;
  doseInterval?: DoseInterval;
  doseUnit?: DoseUnit;
  prescribedEndDateStr?: string;
}

export interface RenewableCard {
  _cardId: number;
  valid: boolean;
  calculable: boolean;
  decision: 'yes' | 'no' | null;
}

/** @deprecated Använd PrescribeInput eller RenewableCard istället */
export interface MedState {
  _cardId: number;
  // Form fields (saved from DOM / inputs)
  medRaw?: string;
  medNameStripped?: string;
  dateVal?: string;
  doseRaw?: string;
  amtRaw?: string;
  refRaw?: string;
  leftRaw?: string;
  doseUnit?: DoseUnit;
  doseInterval?: DoseInterval;
  notCalculable?: boolean;
  // calcCore output fields (cached in state)
  valid?: boolean;
  calculable?: boolean;
  decision?: 'yes' | 'no' | null;
  statusText?: string;
  metrics?: CalcMetric[];
  alerts?: CalcAlert[];
  tlPct?: number;
  tlStart?: string;
  tlEnd?: string;
  dose?: number;
  doseUnitLabel?: string;
  pDateStr?: string;
  total?: number;
  remainingDoses?: number | null;
  endDateStr?: string;
  prescribedEndDateStr?: string;
  daysRemaining?: number;
  daysToPrescribedEnd?: number;
  displayAvgStr?: string;
  avgNote?: string;
  consumptionPct?: number;
  patientText?: string;
  patientTextEn?: string;
  journalText?: string;
  // UI preferences
  activeTab?: 'patient' | 'journal';
  patientLang?: 'sv' | 'en';
  // Prescribe calculated
  amt?: number;
  ref?: number;
}

// === Textgenerering ===

export type CardView = {
  name: string;
  prescribedEndDateStr?: string;
  decision: 'yes' | 'no' | null;
  daysToPrescribedEnd?: number;
  contactDateStr?: string;
  prescribeEnd?: string;
};

// === Långvarig förbrukning ===

export interface LTCardInput {
  medRaw: string;
  dose: number;
  periods: LTCardPeriod[];
}

export interface LTCardPeriod {
  start: string;
  end: string;
  total: number;
}

export interface LTPeriodError {
  id: number;
  startError: boolean;
  endError: boolean;
  totalError: boolean;
  spanError: boolean;
}

export interface LTPeriodResult {
  start: string;
  end: string;
  days: number;
  total: number;
  avg: number;
  consumptionPct: number;
  classification: 'ok' | 'over' | 'under';
}

export interface LTResult {
  valid: boolean;
  overallStatus?: 'ok' | 'over' | 'under';
  alertType?: AlertType;
  alertTitle?: string;
  alertMsg?: string;
  avgStr?: string;
  ordDose?: number;
  totalDays?: number;
  totalTablets?: number;
  overallAvg?: number;
  consumptionPct?: number;
  barPct?: number;
  hasOverlap?: boolean;
  periodErrors: LTPeriodError[];
  periods: LTPeriodResult[];
  fassUrl?: string;
  journalText?: string;
}
