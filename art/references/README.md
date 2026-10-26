# Riferimenti ApexGP 4.1

`circuits.json` conserva le coordinate geografiche delle sole piste selezionate,
gli identificativi delle way OSM, l'orientamento, la linea del traguardo e la
lunghezza della configurazione MotoGP. © OpenStreetMap contributors, ODbL 1.0:
https://www.openstreetmap.org/copyright

Gli estratti completi dell'API OSM, acquisiti il 26 ottobre 2026, sono file di
lavoro in `artifacts/*-osm.xml` (`mugello-osm.txt` per il Mugello). Non includiamo
nel repository i dati di edifici, strade e utenti non necessari al gioco.
`tools/import-circuits.py` seleziona il percorso chiuso dalle relazioni/way,
esclude corsie box e percorsi penalità e controlla distanza e direzione.
`tools/build-circuits.mjs` usa il JSON versionato: la build non accede alla rete.
Il fattore di scala è uniforme sui due assi. Non è una conversione di una
miniatura grafica e non modifica le proporzioni fra rettilinei e curve.

Configurazioni: Mugello 5.245 m; Misano 4.226; Lusail 5.380; Spielberg MotoGP
con chicane 4.348; Motegi Road Course 4.801; Catalunya senza chicane 4.657;
Bugatti 4.185; Assen 4.542; Austin 5.513; Algarve 4.592; Jerez 4.423;
Sachsenring 3.671; Phillip Island 4.448; Silverstone MotoGP 5.900.

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
