export interface InteractionRule {
  a: string[];
  b: string[];
  s: 'danger' | 'warn';
  t: string;
  d: string;
  r: string;
}

export interface InteractionWarning {
  s: 'danger' | 'warn';
  t: string;
  d: string;
  r: string;
  drugs: [string, string];
}

export const INTERACTIONS: InteractionRule[] = [
  { a: ["N06AB"], b: ["N06AF"], s: "danger", t: "Serotonergt syndrom — kontraindicerat", d: "SSRI + MAO-hämmare kan orsaka livshotande serotonergt syndrom (agitation, hypertermi, takykardi, neuromuskulär hyperaktivitet).", r: "Minst 14 dagars uttvättningstid mellan SSRI och MAO-hämmare. Överväg alternativ behandling." },
  { a: ["N06AX"], b: ["N06AF"], s: "danger", t: "Serotonergt syndrom — kontraindicerat", d: "SNRI + MAO-hämmare kan orsaka livshotande serotonergt syndrom.", r: "Minst 14 dagars uttvättningstid mellan SNRI och MAO-hämmare." },
  { a: ["N06AB"], b: ["N02AX02"], s: "danger", t: "Serotonergt syndrom — förhöjd risk", d: "SSRI + tramadol ökar risken för serotonergt syndrom. Tramadol har serotoninåterupptagshämmande egenskaper.", r: "Överväg paracetamol eller NSAID som alternativ smärtlindring. Vid behov av opioid: överväg morfin som har lägre serotonerg effekt." },
  { a: ["N06AB"], b: ["N07BC02"], s: "danger", t: "Serotonergt syndrom — förhöjd risk", d: "SSRI + metadon ökar risken för serotonergt syndrom samt förlängd QT-tid.", r: "Monitorera EKG. Överväg alternativ smärtlindring." },
  { a: ["N06AB"], b: ["N02CC"], s: "warn", t: "Serotonergt syndrom — potentiell risk", d: "SSRI + triptaner (migränmedicin) har i sällsynta fall rapporterats orsaka serotonergt syndrom.", r: "Informera patienten om symtom. Risken är låg men klinisk vaksamhet rekommenderas." },
  { a: ["N06AB"], b: ["J01XX08"], s: "danger", t: "Serotonergt syndrom — kontraindicerat", d: "SSRI + linezolid (antibiotikum med MAO-hämmande effekt) kan orsaka allvarligt serotonergt syndrom.", r: "Undvik kombinationen. Överväg alternativt antibiotikum." },
  { a: ["N06AX12"], b: ["N02AX02"], s: "danger", t: "Sänkta kramptröskeln — risk för kramper", d: "Bupropion sänker kramptröskeln och tramadol ökar kramprisken ytterligare.", r: "Undvik kombinationen. Överväg alternativt antidepressivum eller smärtlindring." },

  // ===== BLÖDNINGSRISK =====
  { a: ["B01AA03"], b: ["M01A"], s: "danger", t: "Ökad blödningsrisk", d: "NSAID ökar blödningsrisken vid warfarinbehandling genom trombocythämning och påverkan på magslemhinnan.", r: "Överväg paracetamol som smärtlindring. Vid nödvändig NSAID-behandling: monitorera PK/INR noggrant och överväg gastroskydd." },
  { a: ["B01AA03"], b: ["N02BA01"], s: "danger", t: "Ökad blödningsrisk", d: "Acetylsalicylsyra i analgetisk dos ökar blödningsrisken vid warfarinbehandling.", r: "Undvik höga doser ASA. Lågdos-ASA (75–160 mg) kan vid etablerad kardiovaskulär sjukdom ges under noggrann PK/INR-monitorering." },
  { a: ["B01AA03"], b: ["B01AC04"], s: "danger", t: "Ökad blödningsrisk", d: "Kombination av warfarin och trombocythämmande ASA ökar blödningsrisken signifikant.", r: "Gränsnytta vid etablerad kardiovaskulär sjukdom. Överväg indikationen och monitorera PK/INR." },
  { a: ["B01AF01"], b: ["M01A"], s: "danger", t: "Ökad blödningsrisk", d: "NSAID + rivaroxaban ökar blödningsrisken genom synergistisk trombocythämning och GI-slemhinnepåverkan.", r: "Överväg paracetamol. Vid nödvändig NSAID-behandling: överväg gastroskydd och noggrann monitorering." },
  { a: ["B01AF02"], b: ["M01A"], s: "danger", t: "Ökad blödningsrisk", d: "NSAID + apixaban ökar blödningsrisken genom synergistisk trombocythämning och GI-slemhinnepåverkan.", r: "Överväg paracetamol. Vid nödvändig NSAID-behandling: överväg gastroskydd och noggrann monitorering." },
  { a: ["B01AA03"], b: ["N06AB"], s: "warn", t: "Ökad blödningsrisk", d: "SSRI ökar risken för GI-blödning vid warfarinbehandling genom påverkan på trombocytaggregationen.", r: "Monitorera PK/INR. Överväg mirtazapin som alternativt antidepressivum." },
  { a: ["B01AC04"], b: ["M01A"], s: "danger", t: "Ökad blödningsrisk", d: "Klopidogrel + NSAID ökar blödningsrisken signifikant genom synergistisk trombocythämning.", r: "Överväg paracetamol. Vid nödvändig NSAID-behandling: håll kort behandlingstid och överväg gastroskydd." },
  { a: ["M01A"], b: ["N06AB"], s: "warn", t: "Ökad blödningsrisk", d: "SSRI + NSAID ökar risken för övre gastrointestinal blödning. SSRI påverkar trombocytaggregationen och NSAID irriterar magslemhinnan additivt.", r: "Överväg paracetamol som smärtlindring. Vid nödvändig NSAID-behandling: överväg gastroskydd (PPI) och informera patienten om blödningssymtom." },
  { a: ["B01AA03"], b: ["J01XD01"], s: "danger", t: "Ökad blödningsrisk", d: "Metronidazol hämmar warfarins metabolism (CYP2C9) och kan kraftigt öka PK/INR med blödningsrisk.", r: "Monitorera PK/INR inom 2–3 dagar efter insättning. Förvänta dig dosreduktion av warfarin med 20–30 %. Överväg alternativt antibiotikum." },
  { a: ["B01AA03"], b: ["J02AC01"], s: "danger", t: "Ökad blödningsrisk", d: "Flukonazol hämmar warfarins metabolism (CYP2C9) och kan orsaka kraftig INR-stegring med blödningsrisk.", r: "Monitorera PK/INR inom 2–3 dagar efter insättning. Förvänta dig dosreduktion av warfarin. Överväg alternativt antimykotikum." },
  { a: ["B01AA03"], b: ["J01MA02"], s: "danger", t: "Ökad blödningsrisk", d: "Ciprofloxacin hämmar warfarins metabolism och kan orsaka INR-stegring med blödningsrisk.", r: "Monitorera PK/INR inom 2–3 dagar efter insättning. Överväg alternativt antibiotikum." },

  // ===== HYPERKALEMI =====
  { a: ["C09A"], b: ["C03DA"], s: "danger", t: "Hyperkalemirisk", d: "ACE-hämmare + kaliumsparande diuretika (spironolakton, eplerenon) kan orsaka allvarlig hyperkalemi.", r: "Kontrollera S-kalium regelbundet. Överväg loopdiuretikum som alternativ." },
  { a: ["C09A"], b: ["C09C"], s: "warn", t: "Dubbel RAAS-blockad — risk för hypotension och hyperkalemi", d: "Kombination av ACE-hämmare och ARB ökar risken för njurpåverkan och hyperkalemi utan dokumenterad mortalitetsvinst.", r: "Dubbel RAAS-blockad rekommenderas ej rutinmässigt. Överväg alternativ kombination." },
  { a: ["C09A"], b: ["A12BA"], s: "danger", t: "Hyperkalemirisk", d: "ACE-hämmare + kaliumtillskott kan orsaka allvarlig hyperkalemi.", r: "Kontrollera S-kalium före och under behandling. Undvik rutinmässiga kaliumtillskott." },
  { a: ["C09C"], b: ["C03DA"], s: "danger", t: "Hyperkalemirisk", d: "ARB + kaliumsparande diuretika (spironolakton, eplerenon) kan orsaka allvarlig hyperkalemi.", r: "Kontrollera S-kalium regelbundet. Överväg loopdiuretikum som alternativ." },
  { a: ["C09A"], b: ["J01EA01"], s: "warn", t: "Hyperkalemirisk", d: "ACE-hämmare + trimetoprim kan orsaka hyperkalemi genom additiv effekt på njurarnas kaliumutsöndring.", r: "Kontrollera S-kalium vid längre tids behandling. Överväg alternativt antibiotikum." },

  // ===== BRADYKARDI / AV-BLOCK =====
  { a: ["C07A"], b: ["C08DA01"], s: "danger", t: "Risk för bradykardi och AV-block", d: "Betablockerare + verapamil kan orsaka uttalad bradykardi, AV-block och hypotension.", r: "Undvik kombinationen. Överväg dihydropyridin-kalciumantagonist (amlodipin, felodipin) istället." },
  { a: ["C07A"], b: ["C08DB01"], s: "danger", t: "Risk för bradykardi och AV-block", d: "Betablockerare + diltiazem kan orsaka bradykardi, AV-block och hypotension.", r: "Undvik kombinationen. Överväg dihydropyridin-kalciumantagonist (amlodipin, felodipin) istället." },
  { a: ["C01AA05"], b: ["C01BD01"], s: "danger", t: "Ökad digoxintoxicitet", d: "Amiodaron ökar digoxinkoncentrationen kraftigt (50–70 %) med risk för allvarlig intoxikation.", r: "Halvera digoxindosen och monitorera S-digoxin och EKG. Överväg alternativt antiarytmikum." },
  { a: ["C01AA05"], b: ["C08DA01"], s: "danger", t: "Ökad digoxintoxicitet", d: "Verapamil ökar digoxinkoncentrationen med risk för intoxikation.", r: "Monitorera S-digoxin och EKG. Överväg dosjustering eller alternativ behandling." },
  { a: ["B01AE07"], b: ["C08DA01"], s: "warn", t: "Ökad dabigatrankoncentration — blödningsrisk", d: "Verapamil ökar dabigatrankoncentrationen med ökad blödningsrisk.", r: "Överväg dosjustering. Undvik samtidig administrering om möjligt." },

  // ===== SMAL TERAPEUTISK BREDD =====
  { a: ["N05AN01"], b: ["M01A"], s: "danger", t: "Ökad litiumkoncentration — intoxikationsrisk", d: "NSAID kan öka litiumkoncentrationen med 25–50 % och orsaka litiumintoxikation.", r: "Undvik kombinationen. Överväg paracetamol. Vid nödvändig NSAID-behandling: monitorera S-litium noggrant och justera dosen." },
  { a: ["N05AN01"], b: ["C03A"], s: "danger", t: "Ökad litiumkoncentration — intoxikationsrisk", d: "Tiaziddiuretika minskar njurclearance av litium och kan orsaka intoxikation.", r: "Monitorera S-litium. Överväg loopdiuretikum eller alternativ behandling." },
  { a: ["N05AN01"], b: ["C09A"], s: "warn", t: "Ökad litiumkoncentration", d: "ACE-hämmare kan öka litiumkoncentrationen och orsaka intoxikation.", r: "Monitorera S-litium noggrant. Överväg alternativt antihypertensivum." },
  { a: ["L04AX03"], b: ["M01A"], s: "danger", t: "Ökad metotrexattoxicitet", d: "NSAID minskar njurclearance av metotrexat vilket kan orsaka allvarlig intoxikation (benmärgssuppression, njursvikt).", r: "Undvik kombinationen. Överväg paracetamol som smärtlindring." },
  { a: ["L04AX03"], b: ["J01EA01"], s: "danger", t: "Ökad metotrexattoxicitet", d: "Trimetoprim minskar njurclearance av metotrexat och ökar risken för intoxikation.", r: "Undvik kombinationen. Överväg alternativt antibiotikum." },
  { a: ["M04AA01"], b: ["L04AX01"], s: "danger", t: "Ökad azatioprintoxicitet — benmärgssuppression", d: "Allopurinol hämmar metabolismen av azatioprin vilket kan orsaka allvarlig benmärgssuppression.", r: "Minska azatioprindosen till 25 % av ursprungsdosen. Monitorera blodstatus." },
  { a: ["L04AX03"], b: ["J01C"], s: "danger", t: "Ökad metotrexattoxicitet", d: "Penicilliner minskar njurclearance av metotrexat och kan orsaka allvarlig intoxikation med benmärgssuppression.", r: "Monitorera njurfunktion och blodstatus. Överväg alternativt antibiotikum (t.ex. erytromycin, klindamycin)." },
  { a: ["N03AX09"], b: ["N03AG01"], s: "danger", t: "Ökad lamotriginnivå — risk för allvarliga hudreaktioner", d: "Valproat ökar lamotriginkoncentrationen cirka 2× via hämning av glukuronidering. Risk för Stevens–Johnsons syndrom vid snabb titrering.", r: "Halvera lamotrigindosen vid insättning av valproat. Titrera lamotrigin långsamt. Monitorera hudutslag." },
  { a: ["L04AX03"], b: ["A02BC"], s: "warn", t: "Ökad metotrexattoxicitet", d: "Protonpumpshämmare kan minska njurclearance av metotrexat och öka risken för intoxikation.", r: "Överväg tillfälligt uppehåll med PPI under metotrexatbehandling eller monitorera MTX-nivåer." },

  // ===== CYP-INTERAKTIONER =====
  { a: ["C10AA01"], b: ["J01FA09"], s: "danger", t: "Rabdomyolysrisk — kraftigt ökad simvastatinkoncentration", d: "Klaritromycin hämmar CYP3A4 och ökar simvastatinkoncentrationen markant med risk för rabdomyolys.", r: "Gör uppehåll med simvastatin under antibiotikakuren. Överväg rosuvastatin eller pravastatin som alternativ." },
  { a: ["C10AA01"], b: ["J02AC02"], s: "danger", t: "Rabdomyolysrisk — kraftigt ökad simvastatinkoncentration", d: "Itrakonazol är en stark CYP3A4-hämmare och ökar simvastatinkoncentrationen markant.", r: "Undvik kombinationen. Gör uppehåll med simvastatin under antimykotisk behandling." },
  { a: ["C10AA05"], b: ["J01FA09"], s: "warn", t: "Ökad statinkoncentration — risk för myopati", d: "Klaritromycin ökar atorvastatinkoncentrationen via CYP3A4-hämning.", r: "Överväg tillfälligt uppehåll eller dosreduktion av atorvastatin under antibiotikakuren." },
  { a: ["B01AC04"], b: ["A02BC01"], s: "warn", t: "Minskad klopidogreleffekt", d: "Omeprazol/esomprazol hämmar CYP2C19 och minskar aktiveringen av klopidogrel med risk för minskad antitrombotisk effekt.", r: "Överväg pantoprazol som alternativ PPI (svagare CYP2C19-hämning)." },
  { a: ["L02BA01"], b: ["N06AB05"], s: "danger", t: "Minskad tamoxifeneffekt — ökad recidivrisk", d: "Paroxetin är en stark CYP2D6-hämmare och minskar aktiveringen av tamoxifen till endoxifen med risk för ökad recidivrisk vid bröstcancer.", r: "Byt till citalopram, escitalopram eller venlafaxin som har svag CYP2D6-hämning." },
  { a: ["L02BA01"], b: ["N06AB03"], s: "danger", t: "Minskad tamoxifeneffekt — ökad recidivrisk", d: "Fluoxetin är en stark CYP2D6-hämmare och minskar aktiveringen av tamoxifen med risk för ökad recidivrisk.", r: "Byt till citalopram, escitalopram eller venlafaxin som alternativ." },
  { a: ["N06AX21"], b: ["L02BA01"], s: "warn", t: "Möjligt minskad tamoxifeneffekt", d: "Duloxetin är en måttlig CYP2D6-hämmare och kan minska aktiveringen av tamoxifen.", r: "Överväg citalopram eller escitalopram som alternativt antidepressivum." },
  { a: ["C10AA01"], b: ["C08CA01"], s: "warn", t: "Ökad statinkoncentration — risk för myopati", d: "Amlodipin hämmar CYP3A4 milt och ökar simvastatinkoncentrationen med cirka 50 %. Vid samtidig behandling bör simvastatindosen inte överstiga 20 mg/dag.", r: "Begränsa simvastatindosen till 20 mg/dag. Övervaka tecken på muskelpåverkan. Rosuvastatin eller pravastatin påverkas inte." },
  { a: ["C10AA"], b: ["C10AB04"], s: "danger", t: "Rabdomyolysrisk — kraftigt ökad statinkoncentration", d: "Gemfibrozil hämmar glukuronideringen av statiner och ökar statinkoncentrationen markant med risk för rabdomyolys.", r: "Undvik kombinationen. Överväg fenofibrat som har lägre interaktionsrisk. Om kombination krävs: monitorera CK och avbryt vid muskelsymtom." },

  // ===== CARDIOVASKULÄRT =====
  { a: ["G04BE"], b: ["C01DA"], s: "danger", t: "Livshotande hypotension — kontraindicerat", d: "PDE5-hämmare (sildenafil, tadalafil) + nitrater orsakar kraftig vasodilatation och kan leda till livshotande hypotension.", r: "Kontraindicerat. Minst 24 timmars uppehåll mellan preparaten (48 tim för tadalafil)." },
  { a: ["C07A"], b: ["A10A"], s: "warn", t: "Maskerade hypoglykemisymtom", d: "Betablockerare kan maskera symtom på hypoglykemi (takykardi, tremor) hos diabetespatienter.", r: "Informera patienten. Överväg kardioselektiv betablockerare vid behov." },
  { a: ["C09A"], b: ["N02BA01"], s: "warn", t: "Minskad antihypertensiv effekt och njurpåverkan", d: "NSAID (inkl. ASA i analgetisk dos) kan minska den blodtryckssänkande effekten av ACE-hämmare och försämra njurfunktionen.", r: "Kontrollera blodtryck och njurfunktion. Överväg paracetamol vid behov av analgetika." },

  // ===== NSAID + RAAS-blockad / diuretika (triple whammy) =====
  { a: ["M01A"], b: ["C09A"], s: "warn", t: "Minskad antihypertensiv effekt och njurpåverkan", d: "NSAID kan minska den blodtryckssänkande effekten av ACE-hämmare och försämra njurfunktionen, särskilt hos äldre och vid redan nedsatt njurfunktion.", r: "Kontrollera blodtryck och njurfunktion inom 1–2 veckor. Överväg paracetamol som smärtlindring." },
  { a: ["M01A"], b: ["C09C"], s: "warn", t: "Minskad antihypertensiv effekt och njurpåverkan", d: "NSAID kan minska den blodtryckssänkande effekten av ARB och försämra njurfunktionen, särskilt hos äldre och vid redan nedsatt njurfunktion.", r: "Kontrollera blodtryck och njurfunktion inom 1–2 veckor. Överväg paracetamol som smärtlindring." },
  { a: ["M01A"], b: ["C03A"], s: "warn", t: "Minskad diuretisk effekt och njurpåverkan", d: "NSAID kan minska den diuretiska effekten av tiazider och öka risken för akut njursvikt, särskilt vid samtidig RAAS-blockad.", r: "Monitorera njurfunktion och blodtryck. Överväg paracetamol som smärtlindring." },
  { a: ["M01A"], b: ["C03C"], s: "warn", t: "Minskad diuretisk effekt och njurpåverkan", d: "NSAID kan minska den diuretiska effekten av loopdiuretika och öka risken för akut njursvikt, särskilt vid samtidig RAAS-blockad.", r: "Monitorera njurfunktion och vätskestatus. Överväg paracetamol som smärtlindring." },

  // ===== QT-FÖRLÄNGNING =====
  { a: ["N06AB04"], b: ["C01BD01"], s: "warn", t: "Förlängd QT-tid — risk för ventrikulär arytmi", d: "Citalopram + amiodaron kan förlänga QT-tiden additivt med risk för torsades de pointes.", r: "Monitorera EKG. Överväg sertralin som alternativt SSRI (mindre QT-påverkan)." },
  { a: ["N06AB10"], b: ["C01BD01"], s: "warn", t: "Förlängd QT-tid — risk för ventrikulär arytmi", d: "Escitalopram + amiodaron kan förlänga QT-tiden additivt.", r: "Monitorera EKG. Överväg sertralin som alternativt SSRI." },
  { a: ["N07BC02"], b: ["N06AB04"], s: "warn", t: "Förlängd QT-tid — risk för ventrikulär arytmi", d: "Metadon + citalopram förlänger QT-tiden additivt.", r: "Monitorera EKG före och under behandling. Överväg alternativt antidepressivum." },
  { a: ["N07BC02"], b: ["J01M"], s: "warn", t: "Förlängd QT-tid — risk för ventrikulär arytmi", d: "Metadon + fluorokinoloner kan förlänga QT-tiden additivt.", r: "Monitorera EKG. Överväg alternativt antibiotikum." },
  { a: ["N07BC02"], b: ["C01BD01"], s: "danger", t: "Förlängd QT-tid — risk för ventrikulär arytmi", d: "Både metadon och amiodaron förlänger QT-tiden - kombinationen kan utlösa allvarlig ventrikulär arytmi.", r: "Monitorera EKG regelbundet. Överväg alternativt antiarytmikum eller smärtlindring." },

  // ===== ÖVRIGA INTERAKTIONER =====
  { a: ["J01MA02"], b: ["M03BX02"], s: "danger", t: "Kraftig tizanidineffekt — hypotoni och sedering", d: "Ciprofloxacin hämmar CYP1A2 och ökar tizanidinkoncentrationen kraftigt med risk för markant hypotoni och sedering.", r: "Undvik kombinationen. Överväg alternativt antibiotikum eller muskelavslappnande medel." },
  { a: ["J01FA09"], b: ["N02CA"], s: "danger", t: "Ergotism — kontraindicerat", d: "Klaritromycin hämmar CYP3A4 och ökar ergotaminkoncentrationen med risk för ergotism (vasospasm, ischemi).", r: "Kontraindicerat. Överväg alternativt antibiotikum eller migränmedel." },
  { a: ["R03DA"], b: ["J01MA02"], s: "danger", t: "Ökad teofyllinkoncentration — intoxikationsrisk", d: "Ciprofloxacin minskar metabolismen av teofyllin och kan orsaka intoxikation (takykardi, kramper).", r: "Undvik kombinationen om möjligt. Vid nödvändig samtidig behandling: halvera teofyllindosen och monitorera S-teofyllin." },
  { a: ["A10BA02"], b: ["C09A"], s: "warn", t: "Ökad risk för laktatacidos", d: "ACE-hämmare kan öka risken för laktatacidos vid samtidig metforminbehandling, särskilt vid nedsatt njurfunktion.", r: "Monitorera njurfunktion. Var uppmärksam på symtom på laktatacidos (illamående, buksmärta, hyperventilation)." },
  { a: ["C09A"], b: ["A10A"], s: "warn", t: "Ökad risk för hypoglykemi", d: "ACE-hämmare kan öka insulinkänsligheten och öka risken för hypoglykemi hos diabetespatienter.", r: "Monitorera blodsocker noggrant vid insättning och dosändring av ACE-hämmare." },
  { a: ["M04AB"], b: ["J01C"], s: "warn", t: "Ökad penicillinkoncentration", d: "Probenecid minskar njurutsöndringen av penicilliner vilket förlänger halveringstiden.", r: "Denna interaktion kan vara avsiktlig (används ibland terapeutiskt). Justera penicillindos vid behov." },
  { a: ["C03C"], b: ["N02BA01"], s: "warn", t: "Minskad diuretisk effekt och njurpåverkan", d: "NSAID kan minska den diuretiska effekten av loopdiuretika och öka risken för akut njursvikt.", r: "Monitorera njurfunktion och vätskestatus. Överväg paracetamol." },
  { a: ["B01AC04"], b: ["B01AF01"], s: "danger", t: "Ökad blödningsrisk", d: "Klopidogrel + rivaroxaban ger synergistisk antitrombotisk effekt med ökad blödningsrisk.", r: "Endast aktuellt vid specifika indikationer (t.ex. efter PCI). Noggrann nytta-risk-bedömning." },
  { a: ["J01M"], b: ["M01A"], s: "warn", t: "Sänkt kramptröskel — risk för kramper", d: "Fluorokinoloner i kombination med NSAID kan sänka kramptröskeln och utlösa epileptiska anfall, särskilt hos äldre och patienter med anamnes på kramper.", r: "Överväg alternativt antibiotikum (t.ex. trimetoprim, nitrofurantoin). Informera patienten om symtom. Undvik kombinationen vid känd epilepsi." },

  // ===== PSYKOFARMAKA =====
  { a: ["N05AH02"], b: ["N06AB08"], s: "danger", t: "Kraftigt ökad klozapinkoncentration — intoxikationsrisk", d: "Fluvoxamin är en stark CYP1A2-hämmare och ökar klozapinkoncentrationen 5–10 gånger med risk för allvarlig intoxikation.", r: "Kontraindicerat eller reducera klozapindosen till cirka 10 % av ursprungsdosen. Monitorera S-klozapin och övervaka CNS-biverkningar." },
  { a: ["N03AF01"], b: ["G03A"], s: "warn", t: "Minskad effekt av hormonella preventivmedel", d: "Karbamazepin inducerar CYP3A4 och ökar metabolismen av östrogen och gestagener, vilket minskar effekten av p-piller, plåster och vaginala ringar.", r: "Rekommendera kompletterande barriärskydd eller icke-hormonell preventivmetod. Överväg kopparspiral." },
  { a: ["N03AF01"], b: ["N05AH04", "N05AX12"], s: "warn", t: "Minskad antipsykotisk effekt", d: "Karbamazepin inducerar CYP3A4 och minskar quetiapin- och aripiprazolnivåerna med 70–90 %, vilket kan leda till recidiv.", r: "Förvänta dig markant högre dosbehov. Överväg antipsykotikum som inte metaboliseras via CYP3A4 (t.ex. olanzapin, paliperidon)." },
  { a: ["N03AF01"], b: ["N03AX09"], s: "warn", t: "Minskad lamotriginnivå", d: "Karbamazepin inducerar glukuronideringen av lamotrigin och minskar lamotriginnivåerna med 40–50 %, vilket kan ge recidiv vid epilepsi/bipolär sjukdom.", r: "Förvänta dig högre lamotrigindoser. Monitorera klinisk effekt." },
  { a: ["N02AJ06", "R05DA04"], b: ["N06AB05", "N06AB03", "N06AX12"], s: "warn", t: "Minskad smärtlindrande effekt av kodein", d: "Kodein är en prodrug som omvandlas till morfin via CYP2D6. Paroxetin, fluoxetin och bupropion hämmar CYP2D6, vilket blockerar denna aktivering.", r: "Förvänta dig utebliven eller kraftigt reducerad effekt av kodein. Överväg morfin eller annan opioid som inte kräver CYP2D6-aktivering." },

  // ===== CARDIOVASKULÄRT / NEFROLOGI =====
  { a: ["H02AB"], b: ["M01A"], s: "warn", t: "Ökad risk för GI-blödning och ulcus", d: "Systemiska kortikosteroider + NSAID ökar risken additivt för övre gastrointestinal blödning och ulcus, särskilt hos äldre.", r: "Överväg paracetamol som smärtlindring. Vid nödvändig NSAID-behandling: kortast möjliga tid, lägsta dos, överväg gastroskydd (PPI)." },
  { a: ["B01AA03"], b: ["C01BD01"], s: "danger", t: "Ökad blödningsrisk — INR-stegring", d: "Amiodaron hämmar CYP2C9 och ökar warfarineffekten kraftigt med risk för allvarlig blödning.", r: "Minska warfarindosen med 30–50 % vid insättning av amiodaron. Monitorera PK/INR inom 3–5 dagar och justera därefter." },
  { a: ["B01AC04"], b: ["A02BC03"], s: "warn", t: "Minskad klopidogreleffekt", d: "Esomeprazol hämmar CYP2C19 och minskar aktiveringen av klopidogrel, samma mekanism som omeprazol.", r: "Överväg pantoprazol som alternativ PPI (svagare CYP2C19-hämning)." },
  { a: ["L04AD01"], b: ["M01A"], s: "danger", t: "Ökad risk för njurtoxicitet", d: "Ciklosporin och NSAID har additiv nefrotoxisk effekt som kan leda till akut njursvikt.", r: "Undvik kombinationen. Överväg paracetamol som smärtlindring. Vid nödvändig NSAID-behandling: monitorera njurfunktion och ciklosporinnivåer noggrant." },

  // ===== FAS 1: TCA-INTERAKTIONER =====
  { a: ["N06AA"], b: ["N06AF"], s: "danger", t: "Serotonergt syndrom — kontraindicerat", d: "TCA + MAO-hämmare kan orsaka livshotande serotonergt syndrom med hypertermi, takykardi och neuromuskulär hyperaktivitet.", r: "Minst 14 dagars uttvättningstid mellan TCA och MAO-hämmare. Överväg alternativ behandling." },
  { a: ["N06AA"], b: ["N06AB", "N06AX"], s: "danger", t: "Ökad TCA-koncentration — intoxikationsrisk", d: "SSRI/SNRI hämmar CYP2D6 och ökar TCA-koncentrationen med risk för antikolinerga och kardiella biverkningar.", r: "Monitorera S-TCA och överväg dosreduktion. Välj SSRI/SNRI med svag CYP2D6-hämning (citalopram, escitalopram, venlafaxin) om kombination krävs." },
  { a: ["N06AA"], b: ["C01BD01", "J01FA", "J01M", "J02AC", "N05A"], s: "danger", t: "Förlängd QT-tid — risk för ventrikulär arytmi", d: "TCA förlänger QT-tiden additivt med andra QT-prolongerande läkemedel med risk för torsades de pointes.", r: "Monitorera EKG vid samtidig behandling. Överväg alternativ med mindre QT-påverkan." },

  // ===== FAS 1: KARBAMAZEPIN/FENYTOIN - CYP-INDUKTION =====
  { a: ["N03AF01"], b: ["B01AA03"], s: "danger", t: "Minskad warfarineffekt — ökad risk för propp", d: "Karbamazepin inducerar CYP2C9 och ökar warfarins metabolism, vilket minskar INR och ökar risken för tromboembolism.", r: "Monitorera PK/INR vid insättning och utsättning av karbamazepin. Förvänta dig ökat warfarinbehov. Överväg DOAC som alternativ." },
  { a: ["N03AF01"], b: ["C10AA"], s: "warn", t: "Minskad statineffekt", d: "Karbamazepin inducerar CYP3A4 och minskar nivåerna av simvastatin och atorvastatin med risk för försämrad lipidkontroll.", r: "Monitorera lipidstatus. Överväg rosuvastatin eller pravastatin som påverkas mindre av CYP3A4-induktion." },
  { a: ["N03AF01"], b: ["B01AF01", "B01AF02", "B01AF03", "B01AE07"], s: "danger", t: "Minskad DOAC-effekt", d: "Karbamazepin inducerar CYP3A4 och/eller P-gp och minskar nivåerna av rivaroxaban, apixaban, edoxaban och dabigatran.", r: "Undvik kombinationen om möjligt. Överväg warfarin som alternativ (med tätare INR-kontroll)." },
  { a: ["N03AF01"], b: ["N06AB", "N06AX"], s: "warn", t: "Minskad antidepressiv effekt", d: "Karbamazepin inducerar metabolismen av SSRI/SNRI via CYP3A4, vilket kan sänka nivåerna och ge recidiv.", r: "Monitorera klinisk effekt. Förvänta dig högre dosbehov vid kombination med karbamazepin." },
  { a: ["N03AB05"], b: ["G03A", "B01AA03", "C10AA"], s: "danger", t: "Minskad effekt av flera läkemedel", d: "Fenytoin är en stark CYP-inducerare som ökar metabolismen av p-piller, warfarin och statiner med risk för utebliven effekt.", r: "Monitorera klinisk effekt och justera doser vid insättning/utsättning av fenytoin. Rekommendera icke-hormonell preventivmetod." },

  // ===== FAS 1: AMIODARON =====
  { a: ["C01BD01"], b: ["C07A"], s: "danger", t: "Risk för bradykardi och AV-block", d: "Amiodaron har additiv negativ kronotrop och dromotrop effekt med betablockerare, med risk för uttalad bradykardi och AV-block.", r: "Monitorera EKG och hjärtfrekvens. Överväg dosreduktion av betablockerare vid insättning av amiodaron." },
  { a: ["C01BD01"], b: ["C10AA"], s: "danger", t: "Ökad statinkoncentration — rabdomyolysrisk", d: "Amiodaron hämmar CYP3A4 och ökar nivåerna av simvastatin och atorvastatin med risk för myopati och rabdomyolys.", r: "Begränsa simvastatin till 20 mg/dag vid samtidig amiodaron. Överväg rosuvastatin eller pravastatin som alternativ." },
  { a: ["C01BD01"], b: ["B01AF01", "B01AF02", "B01AF03", "B01AE07"], s: "danger", t: "Ökad blödningsrisk", d: "Amiodaron hämmar P-gp och/eller CYP3A4 och ökar nivåerna av DOAC med risk för blödning.", r: "Monitorera blödningsrisk. Överväg dosreduktion av dabigatran enligt produktresumé. Försiktighet med rivaroxaban/apixaban." },
  { a: ["C01BD01"], b: ["C01BC04"], s: "danger", t: "Ökad flekainidkoncentration", d: "Amiodaron hämmar CYP2D6 och ökar flekainidnivåerna med risk för kardiell toxicitet.", r: "Minska flekainiddosen med 50 % vid samtidig amiodaron. Monitorera EKG." },

  // ===== FAS 1: MAKROLIDER =====
  { a: ["J01FA"], b: ["B01AA03"], s: "danger", t: "Ökad blödningsrisk — INR-stegring", d: "Makrolider (erytromycin, klaritromycin, azitromycin) hämmar warfarins metabolism med risk för INR-stegring och blödning.", r: "Monitorera PK/INR inom 3–5 dagar efter insättning av makrolid. Förvänta dig dosreduktion av warfarin." },
  { a: ["J01FA"], b: ["B01AF01", "B01AF02", "B01AE07"], s: "danger", t: "Ökad blödningsrisk", d: "Makrolider hämmar CYP3A4 och/eller P-gp och ökar nivåerna av rivaroxaban, apixaban och dabigatran.", r: "Undvik kombinationen om möjligt. Överväg alternativt antibiotikum eller monitorera blödningsrisk." },
  { a: ["J01FA"], b: ["C10AA05"], s: "warn", t: "Ökad statinkoncentration — risk för myopati", d: "Makrolider hämmar CYP3A4 och ökar atorvastatinnivåerna med risk för myopati.", r: "Överväg tillfälligt uppehåll eller dosreduktion av atorvastatin under antibiotikakuren." },

  // ===== FAS 1: CIPROFLOXACIN + CYP1A2 =====
  { a: ["J01MA02"], b: ["N05AH02"], s: "danger", t: "Kraftigt ökad klozapinkoncentration — intoxikationsrisk", d: "Ciprofloxacin hämmar CYP1A2 och ökar klozapinkoncentrationen markant med risk för allvarlig intoxikation.", r: "Undvik kombinationen. Överväg alternativt antibiotikum. Om kombination krävs: reducera klozapindosen kraftigt och monitorera S-klozapin." },
  { a: ["J01MA02"], b: ["N05AH03"], s: "danger", t: "Ökad olanzapinkoncentration", d: "Ciprofloxacin hämmar CYP1A2 och ökar olanzapinnivåerna med risk för CNS-biverkningar.", r: "Monitorera CNS-biverkningar. Överväg olanzapindosreduktion eller alternativt antibiotikum." },

  // ===== FAS 1: VALPROAT + KARBAPENEM =====
  { a: ["N03AG01"], b: ["J01DH"], s: "danger", t: "Kraftigt minskad valproatnivå — recidivrisk", d: "Karbapenemer (meropenem, ertapenem) minskar valproatnivåerna med 60–90 % inom 24 timmar, med risk för epileptiska anfall.", r: "Undvik kombinationen. Överväg alternativt antibiotikum. Om oundvikligt: monitorera S-valproat och förvänta dig markant dosökning." },

  // ===== FAS 1: TOPIRAMAT + P-PILLER =====
  { a: ["N03AX11"], b: ["G03A"], s: "warn", t: "Minskad effekt av p-piller", d: "Topiramat minskar effekten av hormonella preventivmedel vid doser över 200 mg/dag, med risk för oplanerad graviditet.", r: "Rekommendera kompletterande barriärskydd vid topiramatdoser över 200 mg/dag. Överväg icke-hormonell metod." },

  // ===== FAS 1: METFORMIN + JODKONTRAST =====
  { a: ["A10BA02"], b: ["V08A"], s: "danger", t: "Ökad risk för laktatacidos", d: "Jodkontrast kan orsaka akut njurpåverkan och öka risken för metforminassocierad laktatacidos.", r: "Sätt ut metformin 48 timmar före planerad kontrastmedelsundersökning. Återinsätt tidigast 48 timmar efteråt om njurfunktionen är oförändrad." },

  // ===== FAS 1: LITIUM + SSRI =====
  { a: ["N05AN01"], b: ["N06AB"], s: "warn", t: "Ökad risk för serotonergt syndrom och litiumtoxicitet", d: "SSRI kan öka litiumkoncentrationen och ge additiv serotonerg effekt med risk för intoxikation.", r: "Monitorera S-litium inom 1 vecka efter insättning av SSRI. Var uppmärksam på symtom på serotonergt syndrom." },

  // ===== FAS 2: SULFONUREIDER =====
  { a: ["A10BB"], b: ["J02AC01"], s: "danger", t: "Ökad risk för hypoglykemi", d: "Flukonazol hämmar CYP2C9 och minskar metabolismen av sulfonureider med risk för allvarlig hypoglykemi.", r: "Monitorera blodsocker noggrant. Förvänta dig dosreduktion av sulfonureid. Överväg alternativt antimykotikum." },
  { a: ["A10BB"], b: ["B01AA03"], s: "warn", t: "Ökad risk för hypoglykemi och INR-stegring", d: "Sulfonureider kan potentiera warfarineffekten via proteindisplacement, med risk för både hypoglykemi och blödning.", r: "Monitorera blodsocker och PK/INR vid insättning/utsättning av sulfonureid." },
  { a: ["J02AC01"], b: ["N03AB05"], s: "danger", t: "Ökad fenytoinkoncentration", d: "Flukonazol hämmar CYP2C9 och ökar fenytoinnivåerna med risk för intoxikation.", r: "Monitorera S-fenytoin vid insättning av flukonazol. Förvänta dig dosreduktion av fenytoin." },
  { a: ["J01FA09"], b: ["N03AF01"], s: "danger", t: "Ökad karbamazepinkoncentration", d: "Klaritromycin hämmar CYP3A4 och ökar karbamazepinnivåerna med risk för intoxikation.", r: "Monitorera S-karbamazepin och biverkningar. Förvänta dig dosreduktion av karbamazepin." },
  { a: ["C07AB02"], b: ["N06AB05", "N06AB03"], s: "warn", t: "Ökad metoprololeffekt — bradykardi", d: "Paroxetin och fluoxetin hämmar CYP2D6 och ökar metoprololnivåerna avsevärt med risk för bradykardi och hypotension.", r: "Monitorera hjärtfrekvens och blodtryck. Överväg metoprololdosreduktion eller byte till atenolol/bisoprolol." },
  { a: ["H02AB"], b: ["J01M"], s: "warn", t: "Ökad risk för senskada", d: "Systemiska kortikosteroider ökar risken för fluorokinolonassocierad tendinit och senruptur.", r: "Undvik kombinationen hos äldre och vid tidigare senbesvär. Överväg alternativt antibiotikum." },
  { a: ["H02AB"], b: ["A10A", "A10BA", "A10BB"], s: "warn", t: "Förhöjt blodsocker", d: "Systemiska kortikosteroider motverkar effekten av insulin och orala diabetesläkemedel med risk för hyperglykemi.", r: "Monitorera blodsocker noggrant. Förvänta dig ökat behov av diabetesläkemedel under steroidbehandling." },
  { a: ["C09DX04"], b: ["C09A", "C09C"], s: "danger", t: "Kontraindicerat — risk för angioödem", d: "Sacubitril/valsartan i kombination med ACE-hämmare ökar risken för angioödem avsevärt. Minst 36 timmars uppehåll vid byte.", r: "Kontraindicerat. Sätt ut ACE-hämmare minst 36 timmar före insättning av sacubitril/valsartan." },
  { a: ["J01EE01"], b: ["B01AA03"], s: "danger", t: "Ökad blödningsrisk — INR-stegring", d: "Kotrimoxazol innehåller trimetoprim som hämmar warfarins metabolism och kan orsaka INR-stegring och blödning.", r: "Monitorera PK/INR inom 3–5 dagar vid insättning. Förvänta dig dosreduktion av warfarin." },
  { a: ["G03A"], b: ["N03AX09"], s: "warn", t: "Minskad lamotriginnivå", d: "Hormonella preventivmedel ökar glukuronideringen av lamotrigin och minskar lamotriginnivåerna med cirka 50 %.", r: "Monitorera klinisk effekt vid insättning/utsättning av p-piller. Förvänta dig ändrat lamotriginbehov." },
  { a: ["N05A"], b: ["C01BD01", "J01FA", "J01M", "J02AC"], s: "warn", t: "Ökad risk för QT-förlängning", d: "Antipsykotika kan förlänga QT-tiden additivt med andra QT-prolongerande läkemedel.", r: "Monitorera EKG vid kombination av antipsykotika med andra QT-prolongerande läkemedel." },
  { a: ["B01AC04"], b: ["N06AB", "N06AX"], s: "warn", t: "Ökad blödningsrisk", d: "SSRI/SNRI ökar blödningsrisken vid klopidogrelbehandling genom additiv påverkan på trombocytaggregationen.", r: "Monitorera blödningssymtom. Överväg mirtazapin som alternativt antidepressivum." },

  // ===== FAS 3: MEDEL PRIORITET =====
  { a: ["A02BC"], b: ["B03AA"], s: "warn", t: "Minskad järnabsorption", d: "PPI höjer magsackets pH och minskar absorptionen av järnpreparat, vilket kan försämra behandlingseffekten.", r: "Ta järnpreparat med minst 2–4 timmars mellanrum från PPI. Överväg askorbinsyra för att öka absorptionen." },
  { a: ["A10BA02"], b: ["N03AX11"], s: "warn", t: "Ökad risk för acidos", d: "Metformin och topiramat har båda risk för metabol acidos. Additiv effekt kan leda till symtomatisk acidos.", r: "Monitorera bikarbonat/vätejoner i serum vid samtidig behandling. Var uppmärksam på acidossymtom." },
  { a: ["J01FA10"], b: ["C01BD01", "J01M", "J02AC", "N05A"], s: "warn", t: "Möjlig förlängning av QT-tid", d: "Azitromycin kan förlänga QT-tiden additivt med andra QT-prolongerande läkemedel.", r: "Monitorera EKG vid kombination med andra QT-påverkande läkemedel." },
  { a: ["N05AN01"], b: ["N05A"], s: "warn", t: "Ökad risk för neurotoxicitet", d: "Litium och antipsykotika kan i kombination ge additiv eller synergistisk neurotoxicitet med förvirring, tremor och kramper.", r: "Monitorera neurologiska symtom. Överväg S-litium och dosjustering." },
  { a: ["N05AN01"], b: ["C09C"], s: "warn", t: "Ökad litiumkoncentration", d: "ARB kan minska njurclearance av litium och öka risken för litiumintoxikation, samma mekanism som ACE-hämmare.", r: "Monitorera S-litium noggrant. Överväg alternativt antihypertensivum." },
  { a: ["C01AA05"], b: ["J01FA"], s: "danger", t: "Ökad digoxinkoncentration", d: "Makrolider hämmar P-gp och ökar digoxinabsorptionen med risk för digoxintoxikation.", r: "Monitorera S-digoxin och EKG. Förvänta dig dosreduktion av digoxin vid makrolidbehandling." },
  { a: ["C01AA05"], b: ["C03A", "C03C"], s: "warn", t: "Ökad risk för digoxintoxikation", d: "Diuretika kan orsaka hypokalemi och hypomagnesemi, vilket ökar digoxinets kardiella toxicitet även vid normala S-digoxinnivåer.", r: "Monitorera S-kalium och S-magnesium. Korrigera elektrolytrubbningar före digoxindosjustering." },
  { a: ["N03AA02"], b: ["G03A"], s: "warn", t: "Minskad effekt av p-piller", d: "Fenobarbital inducerar CYP3A4 och ökar metabolismen av hormonella preventivmedel.", r: "Rekommendera icke-hormonell preventivmetod eller kompletterande barriärskydd." },
  { a: ["N03AA02"], b: ["B01AA03"], s: "danger", t: "Minskad warfarineffekt", d: "Fenobarbital inducerar CYP2C9 och CYP3A4 och minskar warfarinnivåerna med risk för propp.", r: "Monitorera PK/INR vid insättning/utsättning. Förvänta dig ökat warfarinbehov." },
  { a: ["M01AE01", "M01AB05", "M01AC06"], b: ["B01AC06"], s: "warn", t: "Minskad trombocythämmande effekt", d: "Ibuprofen, diklofenak och meloxikam kan interferera med lågdos-ASAs antiaggregatoriska effekt genom kompetition vid COX-1.", r: "Ta ibuprofen minst 30 minuter efter ASA (eller 8 timmar före). Överväg paracetamol eller naproxen som alternativ." },
  { a: ["A10BA02"], b: ["C09C"], s: "warn", t: "Ökad risk för laktatacidos", d: "ARB kan påverka njurfunktionen och därmed öka risken för metforminassocierad laktatacidos, särskilt vid nedsatt njurfunktion.", r: "Monitorera njurfunktion. Var uppmärksam på symtom på laktatacidos." },
  { a: ["H02AB"], b: ["C03A", "C03C"], s: "warn", t: "Ökad risk för hypokalemi", d: "Kortikosteroider och diuretika har additiv kaliumförlust via olika mekanismer, vilket ökar risken för hypokalemi.", r: "Monitorera S-kalium regelbundet. Överväg kaliumtillskott vid behov." },
  { a: ["J02AC03"], b: ["N03AF01"], s: "danger", t: "Kontraindicerat — kraftigt reducerad vorikonazoleffekt", d: "Karbamazepin inducerar CYP3A4 och minskar vorikonazolnivåerna kraftigt, med risk för utebliven antimykotisk effekt.", r: "Kontraindicerat. Överväg alternativt antimykotikum eller antiepileptikum." },
  { a: ["B01AC04"], b: ["A02BC", "A02BC03"], s: "warn", t: "Minskad klopidogreleffekt", d: "Lansoprazol och andra PPI hämmar CYP2C19 och minskar aktiveringen av klopidogrel, samma mekanism som omeprazol.", r: "Överväg pantoprazol som har svagare CYP2C19-hämning." },
  { a: ["J02AC"], b: ["A02BC"], s: "warn", t: "Minskad effekt av azol-antimykotika", d: "PPI höjer magsackets pH och kan minska absorptionen av vissa azol-antimykotika (särskilt itrakonazol och posakonazol).", r: "Ta azol-antimykotika med sur dryck (t.ex. läsk) och med minst 2 timmars mellanrum från PPI." },

];

export function atcMatches(atcCode: string | null | undefined, pattern: string): boolean {
  return atcCode ? atcCode.startsWith(pattern) : false;
}

export function CHECK_INTERACTIONS(atcEntries: Array<{ a: string; i: string }>): InteractionWarning[] {
  const warnings: InteractionWarning[] = [];
  for (let i = 0; i < INTERACTIONS.length; i++) {
    const ix = INTERACTIONS[i];
    for (let x = 0; x < atcEntries.length; x++) {
      for (let y = x + 1; y < atcEntries.length; y++) {
        const matchAB = ix.a.some(p => atcMatches(atcEntries[x].a, p))
                     && ix.b.some(p => atcMatches(atcEntries[y].a, p));
        const matchBA = ix.a.some(p => atcMatches(atcEntries[y].a, p))
                     && ix.b.some(p => atcMatches(atcEntries[x].a, p));
        if (matchAB || matchBA) {
          let already = false;
          for (let w = 0; w < warnings.length; w++) {
            if (warnings[w].t === ix.t && warnings[w].drugs[0] === atcEntries[x].i && warnings[w].drugs[1] === atcEntries[y].i) {
              already = true;
              break;
            }
          }
          if (!already) {
            warnings.push({
              s: ix.s,
              t: ix.t,
              d: ix.d,
              r: ix.r,
              drugs: [atcEntries[x].i, atcEntries[y].i],
            });
          }
        }
      }
    }
  }
  return warnings;
}
