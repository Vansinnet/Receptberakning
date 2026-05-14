var INTERACTIONS = [
  // ===== SEROTONERGA SYNDROM =====
  { a: ["N06AB"], b: ["N06AF"], s: "danger", t: "Serotonergt syndrom \u2014 kontraindicerat", d: "SSRI + MAO-h\u00e4mmare kan orsaka livshotande serotonergt syndrom (agitation, hypertermi, takykardi, neuromuskul\u00e4r hyperaktivitet).", r: "Minst 14 dagars uttv\u00e4ttningstid mellan SSRI och MAO-h\u00e4mmare. \u00d6verv\u00e4g alternativ behandling." },
  { a: ["N06AX"], b: ["N06AF"], s: "danger", t: "Serotonergt syndrom \u2014 kontraindicerat", d: "SNRI + MAO-h\u00e4mmare kan orsaka livshotande serotonergt syndrom.", r: "Minst 14 dagars uttv\u00e4ttningstid mellan SNRI och MAO-h\u00e4mmare." },
  { a: ["N06AB"], b: ["N02AX02"], s: "danger", t: "Serotonergt syndrom \u2014 f\u00f6rh\u00f6jd risk", d: "SSRI + tramadol \u00f6kar risken f\u00f6r serotonergt syndrom. Tramadol har serotonin\u00e5terupptagsh\u00e4mmande egenskaper.", r: "\u00d6verv\u00e4g paracetamol eller NSAID som alternativ sm\u00e4rtlindring. Vid behov av opioid: \u00f6verv\u00e4g morfin som har l\u00e4gre serotonerg effekt." },
  { a: ["N06AB"], b: ["N07BC02"], s: "danger", t: "Serotonergt syndrom \u2014 f\u00f6rh\u00f6jd risk", d: "SSRI + metadon \u00f6kar risken f\u00f6r serotonergt syndrom samt f\u00f6rl\u00e4ngd QT-tid.", r: "Monitorera EKG. \u00d6verv\u00e4g alternativ sm\u00e4rtlindring." },
  { a: ["N06AB"], b: ["N02CC"], s: "warn", t: "Serotonergt syndrom \u2014 potentiell risk", d: "SSRI + triptaner (migr\u00e4nmedicin) har i s\u00e4llsynta fall rapporterats orsaka serotonergt syndrom.", r: "Informera patienten om symtom. Risken \u00e4r l\u00e5g men klinisk vaksamhet rekommenderas." },
  { a: ["N06AB"], b: ["J01XX08"], s: "danger", t: "Serotonergt syndrom \u2014 kontraindicerat", d: "SSRI + linezolid (antibiotikum med MAO-h\u00e4mmande effekt) kan orsaka allvarligt serotonergt syndrom.", r: "Undvik kombinationen. \u00d6verv\u00e4g alternativt antibiotikum." },
  { a: ["N06AX12"], b: ["N02AX02"], s: "danger", t: "S\u00e4nkta kramptr\u00f6skeln \u2014 risk f\u00f6r kramper", d: "Bupropion s\u00e4nker kramptr\u00f6skeln och tramadol \u00f6kar kramprisken ytterligare.", r: "Undvik kombinationen. \u00d6verv\u00e4g alternativt antidepressivum eller sm\u00e4rtlindring." },

  // ===== BL\u00d6DNINGSRISK =====
  { a: ["B01AA03"], b: ["M01A"], s: "danger", t: "\u00d6kad bl\u00f6dningsrisk", d: "NSAID \u00f6kar bl\u00f6dningsrisken vid warfarinbehandling genom trombocyth\u00e4mning och p\u00e5verkan p\u00e5 magslemhinnan.", r: "\u00d6verv\u00e4g paracetamol som sm\u00e4rtlindring. Vid n\u00f6dv\u00e4ndig NSAID-behandling: monitorera PK/INR noggrant och \u00f6verv\u00e4g gastroskydd." },
  { a: ["B01AA03"], b: ["N02BA01"], s: "danger", t: "\u00d6kad bl\u00f6dningsrisk", d: "Acetylsalicylsyra i analgetisk dos \u00f6kar bl\u00f6dningsrisken vid warfarinbehandling.", r: "Undvik h\u00f6ga doser ASA. L\u00e5gdos-ASA (75\u2013160 mg) kan vid etablerad kardiovaskul\u00e4r sjukdom ges under noggrann PK/INR-monitorering." },
  { a: ["B01AA03"], b: ["B01AC06"], s: "danger", t: "\u00d6kad bl\u00f6dningsrisk", d: "Kombination av warfarin och trombocyth\u00e4mmande ASA \u00f6kar bl\u00f6dningsrisken signifikant.", r: "Gr\u00e4nsnytta vid etablerad kardiovaskul\u00e4r sjukdom. \u00d6verv\u00e4g indikationen och monitorera PK/INR." },
  { a: ["B01AF01"], b: ["M01A"], s: "danger", t: "\u00d6kad bl\u00f6dningsrisk", d: "NSAID + rivaroxaban \u00f6kar bl\u00f6dningsrisken genom synergistisk trombocyth\u00e4mning och GI-slemhinnep\u00e5verkan.", r: "\u00d6verv\u00e4g paracetamol. Vid n\u00f6dv\u00e4ndig NSAID-behandling: \u00f6verv\u00e4g gastroskydd och noggrann monitorering." },
  { a: ["B01AF02"], b: ["M01A"], s: "danger", t: "\u00d6kad bl\u00f6dningsrisk", d: "NSAID + apixaban \u00f6kar bl\u00f6dningsrisken genom synergistisk trombocyth\u00e4mning och GI-slemhinnep\u00e5verkan.", r: "\u00d6verv\u00e4g paracetamol. Vid n\u00f6dv\u00e4ndig NSAID-behandling: \u00f6verv\u00e4g gastroskydd och noggrann monitorering." },
  { a: ["B01AA03"], b: ["N06AB"], s: "warn", t: "\u00d6kad bl\u00f6dningsrisk", d: "SSRI \u00f6kar risken f\u00f6r GI-bl\u00f6dning vid warfarinbehandling genom p\u00e5verkan p\u00e5 trombocytaggregationen.", r: "Monitorera PK/INR. \u00d6verv\u00e4g mirtazapin som alternativt antidepressivum." },
  { a: ["B01AC04"], b: ["M01A"], s: "danger", t: "\u00d6kad bl\u00f6dningsrisk", d: "Klopidogrel + NSAID \u00f6kar bl\u00f6dningsrisken signifikant genom synergistisk trombocyth\u00e4mning.", r: "\u00d6verv\u00e4g paracetamol. Vid n\u00f6dv\u00e4ndig NSAID-behandling: h\u00e5ll kort behandlingstid och \u00f6verv\u00e4g gastroskydd." },
  { a: ["M01A"], b: ["N06AB"], s: "warn", t: "\u00d6kad bl\u00f6dningsrisk", d: "SSRI + NSAID \u00f6kar risken f\u00f6r \u00f6vre gastrointestinal bl\u00f6dning. SSRI p\u00e5verkar trombocytaggregationen och NSAID irriterar magslemhinnan additivt.", r: "\u00d6verv\u00e4g paracetamol som sm\u00e4rtlindring. Vid n\u00f6dv\u00e4ndig NSAID-behandling: \u00f6verv\u00e4g gastroskydd (PPI) och informera patienten om bl\u00f6dningssymtom." },
  { a: ["B01AA03"], b: ["J01XD01"], s: "danger", t: "\u00d6kad bl\u00f6dningsrisk", d: "Metronidazol h\u00e4mmar warfarins metabolism (CYP2C9) och kan kraftigt \u00f6ka PK/INR med bl\u00f6dningsrisk.", r: "Monitorera PK/INR inom 2\u20133 dagar efter ins\u00e4ttning. F\u00f6rv\u00e4nta dig dosreduktion av warfarin med 20\u201330 %. \u00d6verv\u00e4g alternativt antibiotikum." },
  { a: ["B01AA03"], b: ["J02AC01"], s: "danger", t: "\u00d6kad bl\u00f6dningsrisk", d: "Flukonazol h\u00e4mmar warfarins metabolism (CYP2C9) och kan orsaka kraftig INR-stegring med bl\u00f6dningsrisk.", r: "Monitorera PK/INR inom 2\u20133 dagar efter ins\u00e4ttning. F\u00f6rv\u00e4nta dig dosreduktion av warfarin. \u00d6verv\u00e4g alternativt antimykotikum." },
  { a: ["B01AA03"], b: ["J01MA02"], s: "danger", t: "\u00d6kad bl\u00f6dningsrisk", d: "Ciprofloxacin h\u00e4mmar warfarins metabolism och kan orsaka INR-stegring med bl\u00f6dningsrisk.", r: "Monitorera PK/INR inom 2\u20133 dagar efter ins\u00e4ttning. \u00d6verv\u00e4g alternativt antibiotikum." },

  // ===== HYPERKALEMI =====
  { a: ["C09A"], b: ["C03DA"], s: "danger", t: "Hyperkalemirisk", d: "ACE-h\u00e4mmare + kaliumsparande diuretika (spironolakton, eplerenon) kan orsaka allvarlig hyperkalemi.", r: "Kontrollera S-kalium regelbundet. \u00d6verv\u00e4g loopdiuretikum som alternativ." },
  { a: ["C09A"], b: ["C09C"], s: "warn", t: "Dubbel RAAS-blockad \u2014 risk f\u00f6r hypotension och hyperkalemi", d: "Kombination av ACE-h\u00e4mmare och ARB \u00f6kar risken f\u00f6r njurp\u00e5verkan och hyperkalemi utan dokumenterad mortalitetsvinst.", r: "Dubbel RAAS-blockad rekommenderas ej rutinm\u00e4ssigt. \u00d6verv\u00e4g alternativ kombination." },
  { a: ["C09A"], b: ["A12BA"], s: "danger", t: "Hyperkalemirisk", d: "ACE-h\u00e4mmare + kaliumtillskott kan orsaka allvarlig hyperkalemi.", r: "Kontrollera S-kalium f\u00f6re och under behandling. Undvik rutinm\u00e4ssiga kaliumtillskott." },
  { a: ["C09C"], b: ["C03DA"], s: "danger", t: "Hyperkalemirisk", d: "ARB + kaliumsparande diuretika (spironolakton, eplerenon) kan orsaka allvarlig hyperkalemi.", r: "Kontrollera S-kalium regelbundet. \u00d6verv\u00e4g loopdiuretikum som alternativ." },
  { a: ["C09A"], b: ["J01EA01"], s: "warn", t: "Hyperkalemirisk", d: "ACE-h\u00e4mmare + trimetoprim kan orsaka hyperkalemi genom additiv effekt p\u00e5 njurarnas kaliumuts\u00f6ndring.", r: "Kontrollera S-kalium vid l\u00e4ngre tids behandling. \u00d6verv\u00e4g alternativt antibiotikum." },

  // ===== BRADYKARDI / AV-BLOCK =====
  { a: ["C07A"], b: ["C08DA01"], s: "danger", t: "Risk f\u00f6r bradykardi och AV-block", d: "Betablockerare + verapamil kan orsaka uttalad bradykardi, AV-block och hypotension.", r: "Undvik kombinationen. \u00d6verv\u00e4g dihydropyridin-kalciumantagonist (amlodipin, felodipin) ist\u00e4llet." },
  // OBS: Diltiazem (C08DB01) finns ej i svenska FASS per 2026 — regeln \u00e4r kliniskt korrekt
  // men v\u00e4ntar p\u00e5 databas-t\u00e4ckning.
  { a: ["C07A"], b: ["C08DB01"], s: "danger", t: "Risk f\u00f6r bradykardi och AV-block", d: "Betablockerare + diltiazem kan orsaka bradykardi, AV-block och hypotension.", r: "Undvik kombinationen. \u00d6verv\u00e4g dihydropyridin-kalciumantagonist (amlodipin, felodipin) ist\u00e4llet." },
  { a: ["C01AA05"], b: ["C01BD01"], s: "danger", t: "\u00d6kad digoxintoxicitet", d: "Amiodaron \u00f6kar digoxinkoncentrationen kraftigt (50\u201370 %) med risk f\u00f6r allvarlig intoxikation.", r: "Halvera digoxindosen och monitorera S-digoxin och EKG. \u00d6verv\u00e4g alternativt antiarytmikum." },
  { a: ["C01AA05"], b: ["C08DA01"], s: "danger", t: "\u00d6kad digoxintoxicitet", d: "Verapamil \u00f6kar digoxinkoncentrationen med risk f\u00f6r intoxikation.", r: "Monitorera S-digoxin och EKG. \u00d6verv\u00e4g dosjustering eller alternativ behandling." },
  { a: ["B01AE07"], b: ["C08DA01"], s: "warn", t: "\u00d6kad dabigatrankoncentration \u2014 bl\u00f6dningsrisk", d: "Verapamil \u00f6kar dabigatrankoncentrationen med \u00f6kad bl\u00f6dningsrisk.", r: "\u00d6verv\u00e4g dosjustering. Undvik samtidig administrering om m\u00f6jligt." },

  // ===== SMAL TERAPEUTISK BREDD =====
  { a: ["N05AN01"], b: ["M01A"], s: "danger", t: "\u00d6kad litiumkoncentration \u2014 intoxikationsrisk", d: "NSAID kan \u00f6ka litiumkoncentrationen med 25\u201350 % och orsaka litiumintoxikation.", r: "Undvik kombinationen. \u00d6verv\u00e4g paracetamol. Vid n\u00f6dv\u00e4ndig NSAID-behandling: monitorera S-litium noggrant och justera dosen." },
  { a: ["N05AN01"], b: ["C03A"], s: "danger", t: "\u00d6kad litiumkoncentration \u2014 intoxikationsrisk", d: "Tiaziddiuretika minskar njurclearance av litium och kan orsaka intoxikation.", r: "Monitorera S-litium. \u00d6verv\u00e4g loopdiuretikum eller alternativ behandling." },
  { a: ["N05AN01"], b: ["C09A"], s: "warn", t: "\u00d6kad litiumkoncentration", d: "ACE-h\u00e4mmare kan \u00f6ka litiumkoncentrationen och orsaka intoxikation.", r: "Monitorera S-litium noggrant. \u00d6verv\u00e4g alternativt antihypertensivum." },
  { a: ["L04AX03"], b: ["M01A"], s: "danger", t: "\u00d6kad metotrexattoxicitet", d: "NSAID minskar njurclearance av metotrexat vilket kan orsaka allvarlig intoxikation (benm\u00e4rgssuppression, njursvikt).", r: "Undvik kombinationen. \u00d6verv\u00e4g paracetamol som sm\u00e4rtlindring." },
  { a: ["L04AX03"], b: ["J01EA01"], s: "danger", t: "\u00d6kad metotrexattoxicitet", d: "Trimetoprim minskar njurclearance av metotrexat och \u00f6kar risken f\u00f6r intoxikation.", r: "Undvik kombinationen. \u00d6verv\u00e4g alternativt antibiotikum." },
  { a: ["M04AA01"], b: ["L04AX01"], s: "danger", t: "\u00d6kad azatioprintoxicitet \u2014 benm\u00e4rgssuppression", d: "Allopurinol h\u00e4mmar metabolismen av azatioprin vilket kan orsaka allvarlig benm\u00e4rgssuppression.", r: "Minska azatioprindosen till 25 % av ursprungsdosen. Monitorera blodstatus." },
  { a: ["L04AX03"], b: ["J01C"], s: "danger", t: "\u00d6kad metotrexattoxicitet", d: "Penicilliner minskar njurclearance av metotrexat och kan orsaka allvarlig intoxikation med benm\u00e4rgssuppression.", r: "Monitorera njurfunktion och blodstatus. \u00d6verv\u00e4g alternativt antibiotikum (t.ex. erytromycin, klindamycin)." },

  // ===== CYP-INTERAKTIONER =====
  { a: ["C10AA01"], b: ["J01FA09"], s: "danger", t: "Rabdomyolysrisk \u2014 kraftigt \u00f6kad simvastatinkoncentration", d: "Klaritromycin h\u00e4mmar CYP3A4 och \u00f6kar simvastatinkoncentrationen markant med risk f\u00f6r rabdomyolys.", r: "G\u00f6r uppeh\u00e5ll med simvastatin under antibiotikakuren. \u00d6verv\u00e4g rosuvastatin eller pravastatin som alternativ." },
  { a: ["C10AA01"], b: ["J02AC02"], s: "danger", t: "Rabdomyolysrisk \u2014 kraftigt \u00f6kad simvastatinkoncentration", d: "Itrakonazol \u00e4r en stark CYP3A4-h\u00e4mmare och \u00f6kar simvastatinkoncentrationen markant.", r: "Undvik kombinationen. G\u00f6r uppeh\u00e5ll med simvastatin under antimykotisk behandling." },
  { a: ["C10AA05"], b: ["J01FA09"], s: "warn", t: "\u00d6kad statinkoncentration \u2014 risk f\u00f6r myopati", d: "Klaritromycin \u00f6kar atorvastatinkoncentrationen via CYP3A4-h\u00e4mning.", r: "\u00d6verv\u00e4g tillf\u00e4lligt uppeh\u00e5ll eller dosreduktion av atorvastatin under antibiotikakuren." },
  { a: ["B01AC04"], b: ["A02BC01"], s: "warn", t: "Minskad klopidogreleffekt", d: "Omeprazol/esomprazol h\u00e4mmar CYP2C19 och minskar aktiveringen av klopidogrel med risk f\u00f6r minskad antitrombotisk effekt.", r: "\u00d6verv\u00e4g pantoprazol som alternativ PPI (svagare CYP2C19-h\u00e4mning)." },
  { a: ["L02BA01"], b: ["N06AB05"], s: "danger", t: "Minskad tamoxifeneffekt \u2014 \u00f6kad recidivrisk", d: "Paroxetin \u00e4r en stark CYP2D6-h\u00e4mmare och minskar aktiveringen av tamoxifen till endoxifen med risk f\u00f6r \u00f6kad recidivrisk vid br\u00f6stcancer.", r: "Byt till citalopram, escitalopram eller venlafaxin som har svag CYP2D6-h\u00e4mning." },
  { a: ["L02BA01"], b: ["N06AB03"], s: "danger", t: "Minskad tamoxifeneffekt \u2014 \u00f6kad recidivrisk", d: "Fluoxetin \u00e4r en stark CYP2D6-h\u00e4mmare och minskar aktiveringen av tamoxifen med risk f\u00f6r \u00f6kad recidivrisk.", r: "Byt till citalopram, escitalopram eller venlafaxin som alternativ." },
  { a: ["N06AX21"], b: ["L02BA01"], s: "warn", t: "M\u00f6jligt minskad tamoxifeneffekt", d: "Duloxetin \u00e4r en m\u00e5ttlig CYP2D6-h\u00e4mmare och kan minska aktiveringen av tamoxifen.", r: "\u00d6verv\u00e4g citalopram eller escitalopram som alternativt antidepressivum." },
  { a: ["C10AA01"], b: ["C08CA01"], s: "warn", t: "\u00d6kad statinkoncentration \u2014 risk f\u00f6r myopati", d: "Amlodipin h\u00e4mmar CYP3A4 milt och \u00f6kar simvastatinkoncentrationen med cirka 50 %. Vid samtidig behandling b\u00f6r simvastatindosen inte \u00f6verstiga 20 mg/dag.", r: "Begr\u00e4nsa simvastatindosen till 20 mg/dag. \u00d6vervaka tecken p\u00e5 muskelp\u00e5verkan. Rosuvastatin eller pravastatin p\u00e5verkas inte." },

  // ===== CARDIOVASKUL\u00c4RT =====
  { a: ["G04BE"], b: ["C01DA"], s: "danger", t: "Livshotande hypotension \u2014 kontraindicerat", d: "PDE5-h\u00e4mmare (sildenafil, tadalafil) + nitrater orsakar kraftig vasodilatation och kan leda till livshotande hypotension.", r: "Kontraindicerat. Minst 24 timmars uppeh\u00e5ll mellan preparaten (48 tim f\u00f6r tadalafil)." },
  { a: ["C07A"], b: ["A10A"], s: "warn", t: "Maskerade hypoglykemisymtom", d: "Betablockerare kan maskera symtom p\u00e5 hypoglykemi (takykardi, tremor) hos diabetespatienter.", r: "Informera patienten. \u00d6verv\u00e4g kardioselektiv betablockerare vid behov." },
  { a: ["C09A"], b: ["N02BA01"], s: "warn", t: "Minskad antihypertensiv effekt och njurp\u00e5verkan", d: "NSAID (inkl. ASA i analgetisk dos) kan minska den blodtryckss\u00e4nkande effekten av ACE-h\u00e4mmare och f\u00f6rs\u00e4mra njurfunktionen.", r: "Kontrollera blodtryck och njurfunktion. \u00d6verv\u00e4g paracetamol vid behov av analgetika." },

  // ===== NSAID + RAAS-blockad / diuretika (triple whammy) =====
  { a: ["M01A"], b: ["C09A"], s: "warn", t: "Minskad antihypertensiv effekt och njurp\u00e5verkan", d: "NSAID kan minska den blodtryckss\u00e4nkande effekten av ACE-h\u00e4mmare och f\u00f6rs\u00e4mra njurfunktionen, s\u00e4rskilt hos \u00e4ldre och vid redan nedsatt njurfunktion.", r: "Kontrollera blodtryck och njurfunktion inom 1\u20132 veckor. \u00d6verv\u00e4g paracetamol som sm\u00e4rtlindring." },
  { a: ["M01A"], b: ["C09C"], s: "warn", t: "Minskad antihypertensiv effekt och njurp\u00e5verkan", d: "NSAID kan minska den blodtryckss\u00e4nkande effekten av ARB och f\u00f6rs\u00e4mra njurfunktionen, s\u00e4rskilt hos \u00e4ldre och vid redan nedsatt njurfunktion.", r: "Kontrollera blodtryck och njurfunktion inom 1\u20132 veckor. \u00d6verv\u00e4g paracetamol som sm\u00e4rtlindring." },
  { a: ["M01A"], b: ["C03A"], s: "warn", t: "Minskad diuretisk effekt och njurp\u00e5verkan", d: "NSAID kan minska den diuretiska effekten av tiazider och \u00f6ka risken f\u00f6r akut njursvikt, s\u00e4rskilt vid samtidig RAAS-blockad.", r: "Monitorera njurfunktion och blodtryck. \u00d6verv\u00e4g paracetamol som sm\u00e4rtlindring." },
  { a: ["M01A"], b: ["C03C"], s: "warn", t: "Minskad diuretisk effekt och njurp\u00e5verkan", d: "NSAID kan minska den diuretiska effekten av loopdiuretika och \u00f6ka risken f\u00f6r akut njursvikt, s\u00e4rskilt vid samtidig RAAS-blockad.", r: "Monitorera njurfunktion och v\u00e4tskestatus. \u00d6verv\u00e4g paracetamol som sm\u00e4rtlindring." },

  // ===== QT-F\u00d6RL\u00c4NGNING =====
  { a: ["N06AB04"], b: ["C01BD01"], s: "warn", t: "F\u00f6rl\u00e4ngd QT-tid \u2014 risk f\u00f6r ventrikul\u00e4r arytmi", d: "Citalopram + amiodaron kan f\u00f6rl\u00e4nga QT-tiden additivt med risk f\u00f6r torsades de pointes.", r: "Monitorera EKG. \u00d6verv\u00e4g sertralin som alternativt SSRI (mindre QT-p\u00e5verkan)." },
  { a: ["N06AB10"], b: ["C01BD01"], s: "warn", t: "F\u00f6rl\u00e4ngd QT-tid \u2014 risk f\u00f6r ventrikul\u00e4r arytmi", d: "Escitalopram + amiodaron kan f\u00f6rl\u00e4nga QT-tiden additivt.", r: "Monitorera EKG. \u00d6verv\u00e4g sertralin som alternativt SSRI." },
  { a: ["N07BC02"], b: ["N06AB04"], s: "warn", t: "F\u00f6rl\u00e4ngd QT-tid \u2014 risk f\u00f6r ventrikul\u00e4r arytmi", d: "Metadon + citalopram f\u00f6rl\u00e4nger QT-tiden additivt.", r: "Monitorera EKG f\u00f6re och under behandling. \u00d6verv\u00e4g alternativt antidepressivum." },
  { a: ["N07BC02"], b: ["J01M"], s: "warn", t: "F\u00f6rl\u00e4ngd QT-tid \u2014 risk f\u00f6r ventrikul\u00e4r arytmi", d: "Metadon + fluorokinoloner kan f\u00f6rl\u00e4nga QT-tiden additivt.", r: "Monitorera EKG. \u00d6verv\u00e4g alternativt antibiotikum." },
  { a: ["N07BC02"], b: ["C01BD01"], s: "danger", t: "F\u00f6rl\u00e4ngd QT-tid \u2014 risk f\u00f6r ventrikul\u00e4r arytmi", d: "B\u00e5de metadon och amiodaron f\u00f6rl\u00e4nger QT-tiden - kombinationen kan utl\u00f6sa allvarlig ventrikul\u00e4r arytmi.", r: "Monitorera EKG regelbundet. \u00d6verv\u00e4g alternativt antiarytmikum eller sm\u00e4rtlindring." },

  // ===== \u00d6VRIGA INTERAKTIONER =====
  // OBS: Tizanidin (M03BX02) finns ej i svenska FASS per 2026 — regeln \u00e4r kliniskt korrekt
  // men v\u00e4ntar p\u00e5 databas-t\u00e4ckning.
  { a: ["J01MA02"], b: ["M03BX02"], s: "danger", t: "Kraftig tizanidineffekt \u2014 hypotoni och sedering", d: "Ciprofloxacin h\u00e4mmar CYP1A2 och \u00f6kar tizanidinkoncentrationen kraftigt med risk f\u00f6r markant hypotoni och sedering.", r: "Undvik kombinationen. \u00d6verv\u00e4g alternativt antibiotikum eller muskelavslappnande medel." },
  { a: ["J01FA09"], b: ["N02CA"], s: "danger", t: "Ergotism \u2014 kontraindicerat", d: "Klaritromycin h\u00e4mmar CYP3A4 och \u00f6kar ergotaminkoncentrationen med risk f\u00f6r ergotism (vasospasm, ischemi).", r: "Kontraindicerat. \u00d6verv\u00e4g alternativt antibiotikum eller migr\u00e4nmedel." },
  { a: ["R03DA"], b: ["J01MA02"], s: "danger", t: "\u00d6kad teofyllinkoncentration \u2014 intoxikationsrisk", d: "Ciprofloxacin minskar metabolismen av teofyllin och kan orsaka intoxikation (takykardi, kramper).", r: "Undvik kombinationen om m\u00f6jligt. Vid n\u00f6dv\u00e4ndig samtidig behandling: halvera teofyllindosen och monitorera S-teofyllin." },
  { a: ["A10BA02"], b: ["C09A"], s: "warn", t: "\u00d6kad risk f\u00f6r laktatacidos", d: "ACE-h\u00e4mmare kan \u00f6ka risken f\u00f6r laktatacidos vid samtidig metforminbehandling, s\u00e4rskilt vid nedsatt njurfunktion.", r: "Monitorera njurfunktion. Var uppm\u00e4rksam p\u00e5 symtom p\u00e5 laktatacidos (illam\u00e5ende, buksm\u00e4rta, hyperventilation)." },
  { a: ["C09A"], b: ["A10A"], s: "warn", t: "\u00d6kad risk f\u00f6r hypoglykemi", d: "ACE-h\u00e4mmare kan \u00f6ka insulink\u00e4nsligheten och \u00f6ka risken f\u00f6r hypoglykemi hos diabetespatienter.", r: "Monitorera blodsocker noggrant vid ins\u00e4ttning och dos\u00e4ndring av ACE-h\u00e4mmare." },
  { a: ["M04AB"], b: ["J01C"], s: "warn", t: "\u00d6kad penicillinkoncentration", d: "Probenecid minskar njuruts\u00f6ndringen av penicilliner vilket f\u00f6rl\u00e4nger halveringstiden.", r: "Denna interaktion kan vara avsiktlig (anv\u00e4nds ibland terapeutiskt). Justera penicillindos vid behov." },
  { a: ["C03C"], b: ["N02BA01"], s: "warn", t: "Minskad diuretisk effekt och njurp\u00e5verkan", d: "NSAID kan minska den diuretiska effekten av loopdiuretika och \u00f6ka risken f\u00f6r akut njursvikt.", r: "Monitorera njurfunktion och v\u00e4tskestatus. \u00d6verv\u00e4g paracetamol." },
  { a: ["B01AC04"], b: ["B01AF01"], s: "danger", t: "\u00d6kad bl\u00f6dningsrisk", d: "Klopidogrel + rivaroxaban ger synergistisk antitrombotisk effekt med \u00f6kad bl\u00f6dningsrisk.", r: "Endast aktuellt vid specifika indikationer (t.ex. efter PCI). Noggrann nytta-risk-bed\u00f6mning." },
  { a: ["J01M"], b: ["M01A"], s: "warn", t: "S\u00e4nkt kramptr\u00f6skel \u2014 risk f\u00f6r kramper", d: "Fluorokinoloner i kombination med NSAID kan s\u00e4nka kramptr\u00f6skeln och utl\u00f6sa epileptiska anfall, s\u00e4rskilt hos \u00e4ldre och patienter med anamnes p\u00e5 kramper.", r: "\u00d6verv\u00e4g alternativt antibiotikum (t.ex. trimetoprim, nitrofurantoin). Informera patienten om symtom. Undvik kombinationen vid k\u00e4nd epilepsi." },
];

function atcMatches(atcCode, pattern) {
  return atcCode ? atcCode.startsWith(pattern) : false;
}

function CHECK_INTERACTIONS(atcEntries) {
  var warnings = [];
  for (var i = 0; i < INTERACTIONS.length; i++) {
    var ix = INTERACTIONS[i];
    for (var x = 0; x < atcEntries.length; x++) {
      for (var y = x + 1; y < atcEntries.length; y++) {
        var matchAB = ix.a.some(function(p) { return atcMatches(atcEntries[x].a, p); })
                   && ix.b.some(function(p) { return atcMatches(atcEntries[y].a, p); });
        var matchBA = ix.a.some(function(p) { return atcMatches(atcEntries[y].a, p); })
                   && ix.b.some(function(p) { return atcMatches(atcEntries[x].a, p); });
        if (matchAB || matchBA) {
          var already = false;
          for (var w = 0; w < warnings.length; w++) {
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
              drugs: [atcEntries[x].i, atcEntries[y].i]
            });
          }
        }
      }
    }
  }
  return warnings;
}
