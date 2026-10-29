// Manufacturer data, checked 2026-10-29. CV and PS are metric horsepower.
// A '+' is a published lower bound, never a claim of an exact MotoGP output.
export const BIKE_SPECS = {
  r27: {powerCv: 250, powerOver: true, cc: 1000, weightKg: 157, weightType: 'a secco', noFuel: true,
    source: 'https://www.ducati.com/ww/en/racing/motogp/ducati-lenovo-team-bike-desmosedici-gp',
    note: 'Soglie pubbliche della famiglia Desmosedici GP. La potenza esatta della GP25 non è divulgata; la pagina del team viene aggiornata ogni stagione.'},
  v4: {powerCv: 270, powerOver: true, cc: 1000,
    source: 'https://www.yamaha-racing.com/series/grand-prix/motogp/bike/',
    note: 'Riferimento al precedente quattro in linea, citato nella scheda Yamaha. Il modello di gioco resta la M1 2025, non il V4 2026.'},
  rs: {powerCv: 280, powerOver: true, cc: 1000, weightKg: 157, weightType: 'dichiarato da Aprilia', noFuel: true,
    source: 'https://press.piaggiogroup.com/en_EN/post/show/315140/the-dawn-of-a-new-era-aprilia-.html',
    note: 'Scheda di lancio RS-GP25: oltre 280 CV, non una potenza esatta.'},
  v2c: {powerCv: 120, cc: 890, torqueNm: 93.3, weightKg: 179, weightType: 'in ordine di marcia senza benzina', noFuel: true,
    source: 'https://assets.ctfassets.net/x7j9qwvpvr5s/3pmuptbJqFVY17ub39Fpab/fac397d7586b7df63d72219ed2f2f8c6/Brochure_MY25_Panigale_V2_ENG_Web.pdf',
    note: 'Panigale V2 standard MY2025. La V2 S ha un peso diverso.'},
  x4a: {powerCv: 244.7, powerOver: true, cc: 1000,
    source: 'https://www.honda.co.jp/HRC/motogp/machine/',
    note: 'HRC dichiara oltre 180 kW, convertiti in CV. La potenza esatta della RC213V 2025 non è pubblicata.'},
  r9e: {powerCv: 240, powerOver: true, cc: 1000, weightKg: 157, weightType: 'minimo dichiarato', noFuel: true, topKmh: 340, topOver: true,
    source: 'https://www1.suzuki.co.jp/motor/motogp_japan/2022/machine.html',
    note: 'GSX-RR 2022: almeno 157 kg, oltre 240 PS e almeno 340 km/h.'},
  s3: {powerCv: 130, cc: 765, torqueNm: 80,
    source: 'https://prtimes.jp/main/html/rd/p/000000074.000031383.html',
    note: 'Comunicato Triumph Motorcycles Japan per la Daytona Moto2 765 MY2020. Il peso non è riportato nella scheda di lancio.'},
  t12: {powerCv: 218, cc: 998, torqueNm: 111.3, weightKg: 193.5, weightType: 'in ordine di marcia',
    source: 'https://assets.ctfassets.net/x7j9qwvpvr5s/2aZO0qWydGl9cbAoejXef7/c1a56a86e6d84314897b94d91c7cfaa3/Panigale_V4_R_MY_2023_Brochure_ENG.pdf',
    note: 'Configurazione europea stradale MY2023, senza scarico racing.'},
  gtr: {cc: 1000,
    source: 'https://www.ktm.com/en-au/racing/racing-news/red-bull-ktm-all-in-for-2025-motogp--glory.html',
    note: 'RC16 2025: potenza e massa esatte non pubblicate nel comunicato KTM. I valori della fisica restano stime arcade, non dati dichiarati.'},
  i4: {cc: 998, weightKg: 207, weightType: 'in ordine di marcia',
    source: 'https://content.kawasaki.com/en-us/products/ProductSpecSheetPDF/2024-ninja-zx-10rr-abs',
    note: 'Scheda Kawasaki USA MY2024: massa circa 207 kg (456,4 lb). La potenza non è dichiarata in questa scheda; il valore di gioco è una stima.'},
  bmw: {powerCv: 218, cc: 999, torqueNm: 113, weightKg: 194, weightType: 'in ordine di marcia, serbatoio ≥90%', topKmh: 314,
    source: 'https://www.bmw-motorrad.de/de/models/m/m1000rr/technicaldata.html',
    note: 'Scheda europea M 1000 RR della generazione MY2025.'},
  rsv4: {powerCv: 220, cc: 1099, torqueNm: 127, weightKg: 204, weightType: 'in ordine di marcia, serbatoio ≥90%',
    source: 'https://wlassets.aprilia.com/wlassets/aprilia/us/tech_spec/2025/RSV4_Factory_tech_spec_EN_US-%281%29/original/RSV4_Factory_tech_spec_EN_US%2B%281%29.pdf',
    note: 'Scheda Aprilia RSV4 Factory 2025: 161,8 kW / 220 CV; 449,7 lb, circa 204 kg.'},
  r1: {powerCv: 200, cc: 998, torqueNm: 113.3, weightKg: 201, weightType: 'in ordine di marcia con pieno',
    source: 'https://cdn2.yamaha-motor.eu/prod/product-assets/2024/YZF1000R1/Factsheets/2024-YZF1000R1_en.pdf',
    note: 'YZF-R1 2024 europea: 147,1 kW / 200 PS.'},
  fireblade: {powerCv: 217.6, cc: 1000, torqueNm: 113, weightKg: 201, weightType: 'in ordine di marcia',
    source: 'https://hondanews.eu/eu/et/motorcycles/media/pressreleases/456839/24ym-honda-cbr1000rr-r-fireblade-sp',
    note: 'Fireblade SP standard MY2024: 160 kW; la Carbon Edition ha un peso diverso.'},
  gsxr: {powerCv: 202, cc: 1000, torqueNm: 118, weightKg: 203, weightType: 'in ordine di marcia con pieno',
    source: 'https://moto.suzuki.ch/fileadmin/media/images/Motos/GSXR-1000/accessories/GSX-R1000R_Fr.pdf',
    note: 'Scheda Suzuki Svizzera per la GSX-R1000R della generazione 2017–2025; le specifiche cambiano secondo il mercato.'},
};

export function declaredPower(id) {
  const spec = BIKE_SPECS[id];
  return spec?.powerCv ? `${spec.powerOver ? '>' : ''}${spec.powerCv.toLocaleString('it-IT')}` : 'n.d.';
}

export function renderBikeSpecs(root, bike) {
  const spec = BIKE_SPECS[bike.id];
  root.replaceChildren();
  const heading = document.createElement('strong'); heading.textContent = `DATI DEL COSTRUTTORE · ${bike.year}`;
  const data = document.createElement('p');
  data.textContent = `${declaredPower(bike.id)} CV · ${spec.cc} cc${spec.torqueNm ? ' · ' + spec.torqueNm.toLocaleString('it-IT') + ' Nm' : ''}`;
  const mass = document.createElement('p');
  mass.textContent = spec.weightKg ? `Massa moto: ${spec.weightKg.toLocaleString('it-IT')} kg · ${spec.weightType}.` : 'Massa esatta non disponibile nella fonte.';
  const note = document.createElement('small'); note.textContent = spec.note;
  const link = document.createElement('a'); link.href = spec.source; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Scheda originale ↗';
  const caveat = document.createElement('p'); caveat.textContent = `Nel gioco: ${bike.power} CV${spec.powerOver ? ' (soglia pubblica usata come riferimento)' : !spec.powerCv ? ' stimati' : ''}. ${spec.topKmh ? 'Velocità del costruttore: ' + (spec.topOver ? '>' : '') + spec.topKmh + ' km/h.' : 'Velocità massima: stima di gioco.'} Aderenza, agilità e potenziamenti sono arcade.`;
  root.append(heading, data, mass, note, document.createElement('br'), link, caveat);
}
