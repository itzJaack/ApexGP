# Riferimenti delle pit lane

Il 9 novembre 2026 sono state consultate 70 immagini georeferenziate: insieme,
ingresso e uscita per 22 circuiti, più viste complete di Misano, Assen, Balaton
e Mandalika. Le fotografie hanno date diverse: non sono un rilievo del 2026.

Download ripetibile: `python tools/fetch-pit-references.py`. Immagini e ricevute
con URL, riquadro EPSG:3857 e dimensioni restano in `artifacts/pit-reference-2026/`,
esclusa dalla distribuzione. Fonte: [Esri World Imagery](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer).
Attribuzione: Esri, Vantor, Earthstar Geographics, and the GIS User Community.
Gli elementi mappati derivano dagli estratti già presenti in `art/references/scenery/`:
© OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).

| Circuito | Corsia verificata | Corpo box |
|---|---|---|
| Mugello | w197788411 | w339812256 |
| Misano | Ingresso e uscita tracciati dalla fotografia | w223737221 |
| Lusail | w196193732, w1004121314 | w152483597 |
| Red Bull Ring | w289111668 | w118364939 |
| Motegi | w229813464 | w815797468 |
| Catalunya | w178416729, w33742214, w178416733 | w33742578 |
| Le Mans | Ingresso corto w257057570 e uscita moto w354149773; esclusi i raccordi auto | Impronta tracciata dalla fotografia |
| Assen | Accesso prima della chicane finale e uscita tracciati dalla fotografia | w274868020 |
| Austin | w514836373 | w376713391 |
| Portimão | w157790380 | w38167081 |
| Jerez | w2497138, w80864055, w1318772811, w80993862 | w773818940 |
| Sachsenring | w34402861 | w34402805, w209350839 |
| Phillip Island | w1436851709, w43598484, w1436851708 | w43598497 |
| Silverstone | w227902927, corsia International/Wing | w227332429, w1412628537 |
| Buriram | w677379784, senza nome | w442694158 |
| Goiânia | w879890871; la fotografia mostra un cantiere | w879890747 |
| Balaton | w1259458777, classificata service | w338856661 |
| Brno | w184267642, senza nome | w28772095 |
| Aragón | w230005499 | w193752607, w230261827 |
| Mandalika | w278760894 | w1041715055 |
| Sepang | w144359483, w23410526 | w144362327 |
| Valencia | w51765217, w1086310124, w1086479988 | w556948363 |

I riquadri fotografici originali sono fissati in `art/references/pit-image-frames.json`,
così rigenerare le corsie non cambia il riferimento quando viene corretto un raccordo.
I tracciamenti manuali con le loro fonti sono in `art/references/pit-traces.json`;
`tools/build-pit-reference-traces.py` converte le coordinate geografiche del gioco.
I portoni hanno profondità e aperture; la corsia di lavoro raggiunge il garage.
Terreno, corsie e pavimenti seguono la stessa quota anche cambiando qualità grafica.
Il livello Prestazioni mantiene i dettagli nel mondo statico.

Ulteriori fonti primarie consultate:

- [Silverstone Wing, costruttore delle facciate](https://www.ashandlacy.com/case-studies/the-silverstone-wing-building/), per copertura, finiture metalliche e fascia rossa.
- [Briefing Misano GT World Challenge 2025](https://api.gt-world-challenge-europe.com/documents/notice/9633/41-687a6a138eb43e474a4818fc-18-07-2025-15-36.pdf), per separazione delle corsie di transito e lavoro.
- [MotoGP: ingresso box a Le Mans](https://www.motogp.com/it/news/2026/05/08/pitlane-entry-protocol-updated-in-le-mans/1064903), per il percorso designato e il controllo del passaggio.
- [Guida spettatori Sepang](https://www.sepangcircuit.com/media/wysiwyg/pdf/MGP25_Spectator_Guide_v3.pdf), per distinguere Main Grandstand e Paddock/Pit Building.
- [Planimetria WorldSBK Assen 2026](https://resources.worldsbk.com/files/results/2026/NED/SBK/L1A/MAP/Track.pdf?version=d4f8d3255a906d6471a4bda107eca8d2): percorso e coordinate dei controlli Pit In (52.96072, 6.52216) e Pit Out (52.96384, 6.52751). Usate per collocare i due segnali nel gioco; gli allestimenti di ciascun evento possono variare.

Larghezza guidabile di 5 m, altezze, materiali, divisione dei portoni, arredi,
raccordi finali al centro della pista e posizione dello stop-and-go restano
ricostruzioni di gioco. Non sono misure ufficiali o una scansione laser.
Le immagini non sono usate come texture né redistribuite.
