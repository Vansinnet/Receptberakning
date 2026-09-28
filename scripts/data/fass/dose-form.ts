// Beredningsform från FASS → enhet i verktyget och kort visningsnamn.
// Ordningen i reglerna är betydelsefull: första träff vinner. Reglerna är oförändrade
// från 4.0 (build-product-db.cjs / generate-drugs.cjs) och låsta av tester.

import type { DoseUnit } from '../../../src/lib/constants.ts';

export interface DoseFormClass {
  /** Enheten dosen anges i, eller null om mängden inte går att beräkna. */
  unit: DoseUnit | null;
  notCalculable: boolean;
}

const NOT_CALCULABLE: DoseFormClass = { unit: null, notCalculable: true };
const unit = (u: DoseUnit): DoseFormClass => ({ unit: u, notCalculable: false });

const has = (s: string, ...parts: string[]) => parts.some((p) => s.includes(p));

export function classifyDoseForm(doseForm: string | null | undefined, strength?: string | null): DoseFormClass {
  if (!doseForm) return unit('st');
  const f = doseForm.toLowerCase();
  const str = strength ?? '';

  // Krämer, salvor, gaser, dialysvätskor m.m.: förbrukningen går inte att räkna i doser.
  if (has(f, 'kräm', 'salva', 'liniment', 'pasta')) return NOT_CALCULABLE;
  if (f.includes('gel') && !f.includes('ögongel')) return NOT_CALCULABLE;
  if (has(f, 'schampo', 'badtillsats')) return NOT_CALCULABLE;
  if (has(f, 'medicinsk gas', 'dialysvätska', 'hemodialys', 'hemofiltration')) return NOT_CALCULABLE;
  if (has(f, 'spädningsvätska', 'spolvätska', 'ögonsköljvätska')) return NOT_CALCULABLE;
  if (has(f, 'inhalationsånga', 'beredningssats', 'puder', 'granulat')) return NOT_CALCULABLE;
  if (/\/g/.test(str)) return NOT_CALCULABLE;

  // Doserade enheter: puffar, sprutor, sprayer, droppar i ögon/öron.
  if (has(f, 'inhalationsspray', 'inhalationspulver')) return unit('dos');
  if (has(f, 'förfylld spruta', 'förfylld injektionspenna')) return unit('dos');
  if (has(f, 'rektalskum', 'nässpray', 'endosbehållare')) return unit('dos');
  if (has(f, 'ögondroppar', 'örondroppar', 'ögongel')) return unit('dos');
  if (f.includes('spray') && !f.includes('kutan')) return unit('dos');
  if (/\/dos/.test(str)) return unit('dos');

  // Vätskor som mäts i volym.
  if (has(f, 'oral lösning', 'oral suspension', 'oral emulsion', 'oral mixtur')) return unit('ml');
  if (has(f, 'droppar', 'sirap')) return unit('ml');
  if (has(f, 'injektion', 'infusion') && !f.includes('förfylld')) return unit('ml');
  if (has(f, 'kutan', 'rektalsuspension', 'munsköljvätska')) return unit('ml');
  if (/\/ml/.test(str)) return unit('ml');

  // Tabletter, kapslar, plåster, implantat, tuggummi, suppositorier.
  return unit('st');
}

/** Ordnade regler: [delsträng(ar), visningsnamn]. Första träff vinner. */
const FORM_NAMES: [string[], string][] = [
  [['depottablett', 'depotablett'], 'Depottablett'],
  [['depotkapsel'], 'Depotkapsel'],
  [['enterotablett'], 'Enterotablett'],
  [['enterokapsel'], 'Enterokapsel'],
  [['resoriblett'], 'Resoriblett'],
  [['tuggtablett'], 'Tuggtablett'],
  [['brustablett'], 'Brustablett'],
  [['munlöslig', 'munsönderfallande'], 'Munsönderfallande'],
  [['smälttablett'], 'Smälttablett'],
  [['sublingual'], 'Sublingual tablett'],
];

const FORM_NAMES_AFTER_CAPSULE: [string[], string][] = [
  [['plåster'], 'Plåster'],
  [['implantat'], 'Implantat'],
  [['tuggummi'], 'Tuggummi'],
  [['vagitorium'], 'Vagitorium'],
  [['suppositorium'], 'Suppositorium'],
  [['oral lösning'], 'Oral lösning'],
  [['oral suspension'], 'Oral suspension'],
  [['oral emulsion'], 'Oral emulsion'],
  [['oral mixtur'], 'Oral mixtur'],
  [['orala droppar'], 'Orala droppar'],
  [['sirap'], 'Sirap'],
  [['inhalationsspray'], 'Inhalationsspray'],
  [['inhalationspulver'], 'Inhalationspulver'],
  [['nässpray'], 'Nässpray'],
  [['rektalskum'], 'Rektalskum'],
  [['endosbehållare'], 'Endosbehållare'],
  [['förfylld spruta'], 'Förfylld spruta'],
  [['förfylld injektionspenna'], 'Injektionspenna'],
  [['injektion'], 'Injektionsvätska'],
  [['infusion'], 'Infusionsvätska'],
  [['ögondroppar'], 'Ögondroppar'],
  [['örondroppar'], 'Örondroppar'],
  [['kutan lösning'], 'Kutan lösning'],
  [['kutan spray'], 'Kutan spray'],
  [['kutant skum'], 'Kutant skum'],
  [['rektalsuspension'], 'Rektalsuspension'],
  [['munsköljvätska'], 'Munsköljvätska'],
  [['kräm'], 'Kräm'],
  [['salva'], 'Salva'],
  [['gel'], 'Gel'],
  [['pasta'], 'Pasta'],
];

/** Kort visningsnamn för beredningsformen, t.ex. "Filmdragerad tablett" → "Tablett". */
export function displayForm(doseForm: string | null | undefined): string {
  if (!doseForm) return 'Tablett';
  const f = doseForm.toLowerCase();
  for (const [parts, name] of FORM_NAMES) if (has(f, ...parts)) return name;
  if (f.includes('kapsel')) return f.includes('mjuk') && !f.includes('hård') ? 'Mjuk kapsel' : 'Kapsel';
  if (f.includes('tablett')) return 'Tablett';
  for (const [parts, name] of FORM_NAMES_AFTER_CAPSULE) if (has(f, ...parts)) return name;
  return doseForm;
}
