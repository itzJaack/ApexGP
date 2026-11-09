# Riferimenti ApexGP 4.10

`circuits.json` conserva le coordinate geografiche delle sole piste selezionate,
gli identificativi delle way OSM, l'orientamento, la linea del traguardo e la
lunghezza della configurazione MotoGP. © OpenStreetMap contributors, ODbL 1.0:
https://www.openstreetmap.org/copyright

Gli estratti completi dell'API OSM, acquisiti il 26 ottobre 2026, sono file di
lavoro in `artifacts/*-osm.xml` (`mugello-osm.txt` per il Mugello). Gli XML
integrali restano nei file di lavoro ignorati; le cache geografiche della build
offline sono versionate in `scenery/`, `elevation/` e `landcover/`.
`tools/import-circuits.py` seleziona il percorso chiuso dalle relazioni/way,
esclude corsie box e percorsi penalità e controlla distanza e direzione.
`tools/build-circuits.mjs` usa il JSON versionato: la build non accede alla rete.
Il fattore di scala è uniforme sui due assi. Non è una conversione di una
miniatura grafica e non modifica le proporzioni fra rettilinei e curve.

Configurazioni: Mugello 5.245 m; Misano 4.226; Lusail 5.380; Spielberg MotoGP
con chicane 4.348; Motegi Road Course 4.801; Catalunya senza chicane 4.657;
Bugatti 4.185; Assen 4.542; Austin 5.513; Algarve 4.592; Jerez 4.423;
Sachsenring 3.671; Phillip Island 4.448; Silverstone MotoGP 5.900.

Completamento del calendario 2026: Buriram 4.554 m; Goiânia 3.835;
Balaton Park motociclistico 4.075; Brno 5.403; MotorLand Aragón FIM 5.077;
Mandalika 4.301; Sepang 5.543; Valencia 4.005. Gli otto estratti sono stati
acquisiti l'8 novembre 2026. Per Balaton sono obbligatorie entrambe le way
motociclistiche 1380605558 e 1380605559; per Aragón la Variante FIM 871207238.
La funzione di importazione rifiuta i percorsi che non le attraversano.
Brno parte sul rettilineo dei box a sud-ovest, non sulla breve way 8585804
che divide il tracciato a nord. La posizione di arrivo di Balaton segue il
loop FL del documento FIM/SBK; le linee prive di un nodo OSM sono proiettate
da una posizione di riferimento approssimata sulla planimetria.

- [MotoGP: calendario 2026 aggiornato](https://www.motogp.com/en/news/2026/01/01/2026-motogp-calendar/755478)
- [Goiânia: autódromo del governo di Goiás](https://goias.gov.br/autodromo-goias/)
- [Balaton: planimetria motociclistica FIM/SBK 2026, 4.075 m](https://resources.worldsbk.com/files/results/2026/HUN/SBK/L1A/MAP/Track.pdf)
- [Brno: planimetria dell'autodromo](https://www.automotodrombrno.cz/content/uploads/2019/07/CzechGP-mapa.pdf)
- [Aragón: scheda Yamaha MotoGP 2026](https://www.yamaha-motogp.com/motogp-season/30-08-2026-grand-prix-of-aragon)

`tools/fetch-terrain-copernicus.py` acquisisce finestre COG native GLO-30
(30 m) dal deposito pubblico Copernicus. Tutti i 22 estratti attuali usano
questa risoluzione; il tool supporta GLO-90 solo come ripiego dichiarato.
`tools/fetch-landcover.py` acquisisce ESA WorldCover 2021 v200, fonte a 10 m
campionata a 20 m. Ogni JSON conserva URL, data, proiezione, risoluzione,
attribuzione e limiti. Gli import richiedono `numpy` e `rasterio`; la build
e il gioco usano esclusivamente gli estratti versionati, senza rete.
Le cache che non corrispondono alla proiezione del circuito sono rifiutate.

Le superfici OSM sono distinte dai confini del sito: `landuse=raceway`
non significa che l'intera area sia asfaltata. I cordoli non mappati sono
inferiti dalle curve; edifici senza quote e vegetazione sono rappresentazioni
procedurali entro i dati di posizione. WorldCover risale al 2021 e ha errori
di classificazione: strade, edifici, parcheggi e vie di fuga mappate hanno
precedenza, e le aperture nei boschi vengono conservate.

© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data
(2021) processed by ESA WorldCover consortium. CC BY 4.0.
https://doi.org/10.5281/zenodo.7254221

Copernicus DEM / European Union / ESA / AWS Open Data:
https://registry.opendata.aws/copernicus-dem/

La tribuna centrale di Sepang (`w144247993`) conserva le due ali sul proprio
ingombro mappato, con una copertura a ventagli ricostruita sulla descrizione
architettonica di [Tilke, portfolio 2026](https://tilke.de/wp-content/uploads/2026/01/2026-Tilke-Portfolio-LQ-1.pdf).
Le parti vicine alla carreggiata vengono ritagliate, anziché scartare tutta la
tribuna per pochi vertici OSM imprecisi. Dimensioni verticali, sedute e dettagli
strutturali restano approssimati. Non sono inclusi modelli del progettista.

Fonti delle specifiche:

- [MotoGP: calendario e schede circuiti](https://www.motogp.com/en/calendar)
- [Mugello: sequenza ufficiale delle curve](https://ww2.mugellocircuit.it/it/pista/descrizione-pista)
- [Red Bull Ring: circuito MotoGP, 4.348 m](https://www.redbullring.com/de/events-tickets/moto-gp/motogp-circuit/)
- [Algarve: scheda MotoGP](https://www.motogp.com/en/calendar/2026/event/Portugal/726fc174-3efe-4c1d-b6f7-72c641e2ca03)
- [Phillip Island: scheda MotoGP](https://www.motogp.com/en/calendar/2025/event/australia/af2f67f7-23e7-4001-afd1-15c26cb168b6)

`art/motorcycles.py` identifica anno ed edizione di ogni moto. In particolare:

- YZR-M1 2025, quattro in linea; il V4 è del 2026: [comunicato Yamaha](https://global.yamaha-motor.com/race/release/2025/030/).
- Panigale V2 2025, 890 cc, senza ali, scarico sotto il codone: [Ducati](https://www.ducati.com/ww/en/bikes/panigale/panigale-v2).
- Panigale V4 R 2023, ali doppie e serbatoio alluminio: [brochure Ducati](https://assets.ctfassets.net/x7j9qwvpvr5s/2aZO0qWydGl9cbAoejXef7/c1a56a86e6d84314897b94d91c7cfaa3/Panigale_V4_R_MY_2023_Brochure_ENG.pdf).
- RS-GP25: [Piaggio/Aprilia](https://press.piaggiogroup.com/en_EN/post/show/315140/the-dawn-of-a-new-era-aprilia-.html).
- RSV4 2025, ali sovrapposte: [Piaggio/Aprilia](https://press.piaggiogroup.com/en_EN/post/show/308733/new-aprilia-rsv4-and-rsv4-fact.html).
- M 1000 RR 2025, ali M 3.0: [BMW Group](https://www.press.bmwgroup.com/usa/article/detail/T0446053EN_US/bmw-motorrad-presents-the-new-bmw-m-1000-rr-bmw-s-1000-rr-bmw-m-1000-r-and-bmw-s-1000-r).
- Fireblade SP 2024, fari sottili, ali laterali e Akrapovič: [Honda](https://global.honda/content/dam/site/global-en/newsroom-new/cq_img/news/2023-new/11/c231107aeng_link.pdf).
- GSX-RR 2022, blu/argento/nero: [Suzuki](https://suzukicycles.com/racing/motogp/suzuki-ecstar).
- GSX-R1000R 2024, variante bianco/blu: [Suzuki](https://suzukicycles.com/news/2023/06/suzuki-unveils-next-wave-of-motorcycles-adding-to-a-strong-2024-lineup).
- Daytona Moto2 765: [Triumph Media](https://triumph-mediakits.com/en/news-articles/new-daytona-moto2%E2%84%A2-765-limited-edition.html).

Le geometrie sono originali e approssimate, non scansioni né asset ufficiali.
Altimetria e scenari restano ricostruzioni; la fisica è arcade. I record precedenti
restano salvati ma i nuovi tracciati hanno una chiave di record/ghost distinta.
