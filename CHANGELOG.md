# Changelog ApexGP

## 4.8.0 — 8 novembre 2026

- Bandiera rossa con applicazione progressiva dei freni, cadute ancora simulate e tempo ufficiale sospeso. Il conto alla rovescia aspetta il gruppo fermo; partenza e ripartenza con cinque lampade rosse, spente al via.
- Gialle locali, singole per pericolo fuori pista e doppie per ostacoli in pista. Settori, minimappa e commissari indicano le zone; soltanto un’ostruzione grave e persistente genera la sospensione automatica.
- Stesse regole per giocatore e bot: avvertimenti, restituzione di una posizione, long lap, doppio long lap, ride-through, tempo aggiunto, perdita di posizioni e squalifica. SCONTA / B guida al percorso fisico. Penalità persistenti dopo la rossa, scadenze per giro, aggravamento e conversione all’arrivo.
- Classifica corretta da tempi e retrocessioni; i piloti squalificati non segnano punti. Anche una squalifica del giocatore consente di proseguire la stagione senza premio gara.
- Long lap e pit lane ricavati, dove presenti, dagli estratti OSM: 12 pit lane e 6 long lap. Collegamenti e percorsi mancanti sono approssimazioni di gioco, documentate in `docs/race-direction.md`.
- Decisioni multiplayer condivise dall’host, compresi i bot: percorsi riprodotti dai client senza trasmettere le loro pose. Il passaggio dei giocatori viene verificato lungo la corsia; un salto all’uscita non sconta la penalità.
- Aderenza e piega massima condivise tra giocatore e IA. Velocità in curva e frenata dipendono dalla moto e dal bagnato; gli errori possono causare vere uscite di pista. Maggiore rispetto delle posizioni sotto gialla e nessuna penalità per chi riceve indietro una posizione.
- Animazioni di bandiere, avvisi e scacchi finali, con riduzione del movimento rispettata.

## 4.7.0 — 7 novembre 2026

- Griglie da 20 piloti: 19 bot nelle gare singole e nel World Tour; in multiplayer i bot completano il gruppo mantenendo il limite di otto giocatori umani. Premi fino al ventesimo posto e risultati delle stagioni precedenti conservati.
- Punti di forza diversi in frenata, curva, accelerazione e velocità, variazioni per settore e scia anche per l'IA. Più occasioni di attacco e una previsione dello spazio durante i sorpassi. Un urto con due caduti viene contato come un solo incidente.
- Scenari offline ricavati da estratti OpenStreetMap per tutti i 14 circuiti: impronte degli edifici, tribune, boschi, alberi mappati, strade, parcheggi, recinzioni e lampioni. Gradinate, pubblico, box, facciate e auto aggiungono dettaglio; altezze e aspetto non documentati restano approssimati.
- Terreno continuo su griglie Copernicus DEM GLO-90 tramite Open-Meteo, con quote della pista derivate dalla stessa superficie. Eliminati i salti generati dal precedente raccordo fra punti della pista.
- Retrovisori 3D sinistro e destro, solo un lato, centrale panoramico o spenti. Impostazioni locali e cambio rapido in gara con il pulsante ↔ o V; aggiornamento ridotto in modalità Prestazioni.
- Classifica di gara compatta con leader e piloti vicini alla propria posizione.

## 4.6.0 — 7 novembre 2026

- IA delle gare singole e del World Tour con sette caratteri, tempi di reazione, punti di frenata, decisioni di sorpasso, difesa e rinuncia. Fiducia e pressione cambiano durante la gara; il comportamento varia a ogni partenza.
- Errori in frenata e in trazione, cadute e recupero anche per gli avversari. La precisione aumenta con il livello; i piloti reagiscono alle moto ferme e a terra.
- Contatti fra tutte le moto locali con sagome allungate, controllo continuo fra i passi di simulazione, impulsi legati alla massa e rotazione dipendente dal punto dell'urto. I tocchi lievi e gli impatti violenti hanno effetti diversi.
- Moto con gravità, rotazione, attrito e contatti a terra; pilota separato con articolazioni vincolate. La mesh del pilota segue le articolazioni e torna alla posa di guida al recupero. Le cadute usano la stessa dinamica per giocatore e bot.
- Bandiera rossa: tutte le velocità vengono azzerate prima del conto alla rovescia. In multiplayer il passaggio rosso/verde resta registrato anche allo stesso tempo gara e i bot accelerano da zero.
- Il client viene pubblicato come modulo completo versionato per evitare dipendenze di versioni diverse nella cache.

## 4.5.0 — 29 ottobre 2026

- Carriera World Tour: 14 tappe con progressione, classifica cumulativa, titoli, premio finale e nuova stagione.
- Mappa mondiale offline con pin nelle posizioni reali dei circuiti, zoom Europa e selezione accessibile da elenco; disponibile anche nei Gran Premi liberi.
- Nuovi profili: una sola moto iniziale fra le tre meno potenti e 3.000 CR; acquisto delle altre moto. Migrazione conservativa dei garage esistenti.
- Premi Rookie ×1, Sport ×2,5 e Pro ×5; difficoltà fissa per la stagione, senza moltiplicatore IA in cronometro e multiplayer.
- Schede delle moto con fonti dei costruttori e distinzione fra valori dichiarati, soglie MotoGP e stime di gioco; potenza e massa alimentano la fisica.
- Stagione e risultati inclusi nei backup e nei salvataggi cloud. Verificati ripristino su due client autenticati e protezione contro aggiornamenti obsoleti.

## 4.4.1 — 27 ottobre 2026

Avvisi di gara e giroscopio.

- Nuovi riquadri compatti per bandiere e avvisi: icone dedicate, accenti di colore, testo su due livelli e indicatore della durata.
- Bandiera verde nascosta; penalità, fuori pista, contatti, cadute e rientri visibili per 0,75 secondi, seguiti da 0,2 secondi di dissolvenza.
- Una colonna sotto la telemetria superiore: le bandiere attive restano sopra agli avvisi, anche su mobile in verticale e orizzontale.
- Gli avvisi ravvicinati si accodano con priorità alle penalità e alle cadute. I messaggi informativi non cancellano un avviso importante; la coda si svuota tornando al menu o iniziando un’altra gara.
- Verso del giroscopio invertito una volta per le calibrazioni precedenti, con preferenza locale salvata e comando Inverti direzione nelle Impostazioni e nella prova finale. Le nuove calibrazioni apprendono sinistra e destra e partono senza inversione aggiuntiva.
- Corretto il nome delle penalità VSC anche quando il motivo arriva in maiuscolo.

## 4.4.0 — 27 ottobre 2026

Traiettoria dinamica.

- Frecce più grandi e leggibili che cambiano gradualmente dal verde al giallo, all’arancione e al rosso in base alla velocità del pilota e alla frenata necessaria.
- Previsione della velocità e dello spazio di frenata, con aderenza, pioggia, pendenze, caratteristiche della moto e potenziamenti dei freni.
- Percorso continuo dall’esterno all’apice e in uscita, corretto per ridurre le curve troppo strette e mantenere le frecce dentro la pista.
- Distanza visibile che cresce con la velocità, colori stabili mentre rallenti e suggerimenti dell’HUD collegati alla stessa previsione.
- Rispetto di bandiere gialle locali, limite VSC e sospensione per bandiera rossa. Stesse indicazioni nella vista dall’alto; l’opzione si può disattivare nelle Impostazioni.

## 4.3.0 — 27 ottobre 2026

Giroscopio e Cinema nativo.

- Sterzo mobile tramite inclinazione selezionabile nelle Impostazioni. I pulsanti restano la scelta predefinita.
- Calibrazione guidata del giroscopio: centro, sinistra, destra e prova finale, con impostazioni salvate sul dispositivo.
- Richiesta dei permessi dei sensori quando necessaria, ricalibrazione dalla gara e ritorno ai pulsanti se il sensore non è disponibile.
- Cinema usa la densità reale dei pixel dello schermo, anche sui display 2K e 4K, entro i limiti della GPU. La risoluzione attuale è visibile nelle Impostazioni.

## 4.2.0 — 27 ottobre 2026

Comandi mobile e sfida IA.

- Sterzo mobile a due pulsanti più grandi, con un’area di tocco più tollerante quando il dito scivola.
- Gas automatico corretto: accelera dal via e si attiva subito premendo ON, con freno più grande e impennata separata.
- Il gas automatico si ferma in pausa e riparte con Riprendi. Cambio app, rotazione e tocchi interrotti mettono la gara in pausa.
- Bot Sport e Pro più competitivi: frenate più tardive, accelerazione migliore e griglia Pro più compatta.
- Numero di versione completo e storico degli aggiornamenti nelle Impostazioni.

## 4.1.0 — 26 ottobre 2026

Circuiti reali e nuove moto.

- Catalogo ampliato a 14 circuiti e 15 moto, con tracciati ricostruiti da coordinate reali.
- Aggiunti Jerez, Sachsenring, Phillip Island e Silverstone, oltre a cinque nuove superbike.
- Geometrie, livree e dettagli delle moto rivisti, con audio motore dedicato.
- Record e ghost separati per i nuovi percorsi; acquisti e progressi precedenti restano disponibili.

## 4.0.0 — 26 ottobre 2026

Mobile, social e stabilità.

- Menu, garage, lobby e comandi touch adattati a smartphone e tablet, in verticale e in orizzontale.
- Richieste di amicizia e profili dei piloti accessibili dalla lobby; schede Amici, Richieste e Inviti.
- Account e sincronizzazione dei progressi tra dispositivi, con recupero dell’accesso.
- Gestione degli errori di rete e caricamento migliorata, con possibilità di riprovare con grafica leggera.
