# ApexGP 4.4.0

Gioco di corse in moto 3D per browser. **[Gioca su GitHub Pages](https://itzjaack.github.io/ApexGP/)** · [Sorgenti e aggiornamenti](https://github.com/itzJaack/ApexGP).

La versione attuale è **4.4.0**. Lo storico delle novità si trova in fondo a **Impostazioni → Changelog**, con l’ultima release aperta e le precedenti espandibili. È disponibile anche in [CHANGELOG.md](CHANGELOG.md).

## Traiettoria dinamica

Le frecce sulla pista reagiscono alla velocità effettiva: **verde** per accelerare, **giallo** per prepararsi o mantenere il ritmo, **arancione e rosso** quando serve frenare. Rallentando, le indicazioni tornano progressivamente verdi. L’HUD usa la stessa previsione con **Prepara il freno**, **Frena** e **Mantieni**, oltre alla velocità consigliata al punto attuale.

La previsione considera la forma della traiettoria, il tratto successivo, aderenza della moto, potenziamenti dei freni, pioggia e pendenze. Il percorso si allarga in ingresso e uscita e cerca l’apice mantenendo un margine dai bordi. La sezione visibile passa da circa 120 a 440 metri con la velocità. La linea tiene conto delle bandiere gialle nella zona dell’incidente, del limite VSC di 90 km/h e della bandiera rossa. Le indicazioni sono disponibili anche nella vista dall’alto. Si disattivano con **Impostazioni → Traiettoria dinamica**.

Il percorso e il profilo di frenata sono precalcolati; durante la guida si aggiornano le frecce vicine usando un buffer grafico riutilizzato. La guida della moto resta manuale e la previsione è un aiuto arcade.

## Smartphone e tablet

Apri lo stesso link dal browser del telefono: non serve installare un’app. Menu, garage, officina, account e lobby si adattano sia in verticale sia in orizzontale e scorrono quando lo spazio è ridotto. I campi di accesso restano leggibili con la tastiera a schermo; i comandi rispettano notch e barra dei gesti.

I comandi touch appaiono automaticamente sui dispositivi tattili. A sinistra trovi due pulsanti **◀ SINISTRA / ▶ DESTRA** più grandi: tienili premuti per sterzare oppure scorri il dito tra i due. Il tocco resta agganciato allo sterzo anche se scivoli leggermente fuori dal bordo; spostandoti molto lontano il comando si rilascia. L’altro dito può frenare senza spostare lo sterzo. **↑ IMPENNA** ha un pulsante separato sopra le frecce.

Il **gas automatico**, inizialmente attivo su touch, accelera dal via senza richiedere un tocco aggiuntivo: a destra basta tenere **FRENO** prima della curva e rilasciarlo per accelerare. **GAS AUTO · ON/OFF** lo attiva o disattiva immediatamente anche durante la gara; in manuale puoi scorrere il dito tra GAS e FRENO. In pausa il gas si ferma e riparte premendo **Riprendi**. Cambiare app, ruotare il dispositivo o interrompere il gesto mette in pausa la gara. Passare ai tasti di guida interrompe il gas automatico finché torni ai comandi touch o lo riattivi esplicitamente.

In **Impostazioni** puoi scegliere visibilità dei comandi touch e gas automatico. Queste scelte restano su questo dispositivo. I controlli rispettano gli spazi del telefono. In alto trovi visuale, audio, amici, **↗ RIENTRA** (+2 secondi) e pausa. **Schermo intero** è disponibile nei browser che lo supportano; se consentito dal browser prova anche a orientare lo schermo in orizzontale. Puoi comunque giocare in verticale. La modalità grafica iniziale rimane **Prestazioni**, con risoluzione adattiva e modelli leggeri.

### Sterzo inclinando il telefono

Lo sterzo mobile predefinito resta **Pulsanti**. In **Impostazioni → Sterzo mobile** puoi scegliere **Inclinazione · tilt to steer**. La procedura **Calibra giroscopio** registra per un secondo ciascuna la posizione neutra, l’inclinazione massima desiderata a sinistra e quella a destra; una quarta schermata permette di provare il risultato prima di applicarlo. La calibrazione apprende il verso e l’escursione comoda, con una piccola zona neutra e risposta progressiva.

Apri il gioco via HTTPS e, se richiesto dal browser, consenti l’accesso ai sensori. Se il sensore non è supportato, non fornisce dati o il permesso viene negato, puoi usare i pulsanti. Se il browser richiede una nuova attivazione al riavvio, premi **Attiva sensori** nelle Impostazioni. La scelta e la calibrazione restano locali al dispositivo. Calibra nello stesso orientamento con cui giocherai; dopo una rotazione ricalibra. Dalla guida in modalità inclinazione trovi **Ricalibra**. La gara va in pausa durante la procedura o se il segnale si interrompe; la tastiera continua a funzionare.

## Difficoltà degli avversari

**Rookie** conserva il passo accessibile. **Sport** aumenta velocità in curva, accelerazione e ritmo sul giro. **Pro** frena più tardi, riparte più forte e mantiene una griglia più compatta, con meno oscillazioni nella traiettoria e velocità superiori sui rettilinei. Il passo non cambia in base al distacco dal giocatore. Pioggia, bandiere gialle, VSC e bandiera rossa continuano a limitare gli avversari.

Anche i bot multiplayer usano il nuovo assetto Sport e pianificano la frenata sull’intera distanza di gara; il limite di 300 km/h conserva i limiti di velocità delle fasi VSC e gialla. I livelli di difficoltà si scelgono nel Gran Premio singolo.

## Account e progressi

Apri **Accedi → Registrati**, scegli un nome utente e una password di almeno otto caratteri e salva il codice di recupero. Lo stesso account ritrova crediti, moto acquistate, potenziamenti, livree, statistiche, record con ghost e preferenze di guida sui diversi dispositivi. Il codice di recupero consente di reimpostare la password: è personale, non condividerlo. Puoi sostituirlo dal profilo; il precedente smette di funzionare.

Il progetto Supabase è sempre `vpdurolhulwsoahbtaho`. Supabase Auth verifica le password e mantiene le sessioni. La registrazione usa un identificativo email interno non recapitabile, senza richiedere un indirizzo email o un servizio SMTP. Il browser contiene esclusivamente la chiave publishable pubblica. Le chiavi di servizio restano nell'ambiente della Edge Function.

Il progetto resta sul piano Free. Il controllo Supabase delle password già compromesse non è attivo: [è una funzione del piano Pro](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). La registrazione e il recupero applicano limiti alle richieste; il gioco richiede almeno otto caratteri per la password.

La carriera cloud è protetta da RLS per `auth.uid()`. Gli aggiornamenti hanno una revisione: un secondo dispositivo con dati vecchi non sovrascrive silenziosamente il cloud. In caso di conflitto, scegli dal profilo quale copia usare. Le modifiche offline restano nella cache dell'account finché torni online. Dopo un'interruzione durante il caricamento iniziale, premi **Riprova sincronizzazione** prima di riprendere la carriera. Il salvataggio viene confermato nel profilo. In multiplayer la fisica continua a essere locale, quindi il gioco non offre protezioni competitive contro modifiche del client.

### Trasferire dalla versione HTML

1. Nel vecchio HTML, apri **Officina → Esporta salvataggio**.
2. Se usavi gli amici, salva anche **Amici → Salva accesso al profilo**. Sul sito importa questo file in **Amici**, **prima** di registrare o collegare l'account: il profilo verrà associato automaticamente all'accesso.
3. Sul sito registrati o accedi, poi apri **Officina → Importa salvataggio**. La carriera importata verrà sincronizzata con l'account.

Il salvataggio carriera della 3.4 trasferisce garage e crediti. I record con ghost rimasti soltanto nel vecchio HTML non fanno parte di quel vecchio formato di esportazione. Il nuovo backup della 4.0 comprende anche i record e le preferenze di guida. La carriera ospite e le cache dei diversi account sono separate. Puoi importare esplicitamente anche la carriera ospite di questo browser dal profilo; viene conservata una copia locale precedente.

## Amici, profili e lobby

In **Amici** trovi tre schede distinte: amici, richieste di amicizia ricevute/inviate e inviti a giocare. Cerca un nome utente per aprire il profilo prima di inviare una richiesta. Il profilo mostra nome, stato online, data di iscrizione e, quando disponibili, gare, vittorie e moto dell’ultima carriera cloud. Crediti, salvataggi completi, dati di accesso e codici di recupero restano personali.

Nella lista dei piloti della lobby usa **Vedi profilo** o **Aggiungi amico**. Se hai già una richiesta ricevuta, compare **Accetta amicizia**; se l’hai già inviata, il pulsante indica **Richiesta inviata**. I bot e i piloti senza profilo collegato sono riconoscibili. Per collegare il tuo profilo, accedi o apri Amici; la lobby lo associa automaticamente. I vecchi client restano compatibili, ma devono essere aggiornati per mostrare i profili nella lista.

**Invita in lobby** serve a proporre una partita a un amico; **Aggiungi amico** invia una richiesta di amicizia. Per rimuovere un amico apri il suo profilo e conferma la rimozione. Tutti i giocatori devono premere **Sono pronto**; il creatore usa **Avvia gara**. Il messaggio sotto i pulsanti spiega cosa manca per partire.

## Grafica e circuiti

**Prestazioni** è l'impostazione iniziale. Usa un massimo di 1280×720 pixel interni, risoluzione adattiva dal 60% al 100%, shader semplificato, nessuna mappa delle ombre o post-processing, modelli dedicati e sezioni del mondo escluse dal disegno quando non visibili. Moto e pilota principali passano a meno di 22 mila triangoli; gli avversari a meno di 10 mila. **Cinema** conserva i modelli dettagliati e l'illuminazione completa. Ora renderizza alla densità reale del display (dimensione visibile × pixel ratio), senza il precedente limite di 1,65×: sui telefoni 2K e sugli schermi 4K usa i pixel disponibili, entro i limiti effettivi di texture, renderbuffer e viewport della GPU. In Impostazioni viene indicata la risoluzione renderizzata. La modalità Prestazioni mantiene la risoluzione adattiva fino a 720p. La scelta grafica resta locale al dispositivo. L'obiettivo è facilitare l'uso su GPU integrate come Intel HD 530; non è stato eseguito un benchmark su un i7-6700 reale.

Il catalogo contiene **14 circuiti e 15 moto**. Mugello, Misano, Lusail, Red Bull Ring, Motegi, Catalunya, Bugatti, Assen, Austin e Algarve hanno ora piante derivate dalle coordinate reali OpenStreetMap. Si aggiungono **Jerez, Sachsenring, Phillip Island e Silverstone**. La scala rispetta la lunghezza di riferimento: Mugello 5,245 km, Spielberg MotoGP con chicane 4,348 km, Algarve 4,592 km. Il Mugello include i cartelli delle 15 curve, da San Donato a Bucine. L'altimetria e gli edifici restano approssimati.

Le dieci moto esistenti hanno carene, frontali, codoni, aerodinamica, scarichi e livree ricostruiti per la specifica edizione. Le cinque nuove sono **BMW M 1000 RR 2025, Aprilia RSV4 Factory 2025, Yamaha YZF-R1 2024, Honda Fireblade SP 2024 e Suzuki GSX-R1000R 2024**. Il garage distingue anno e categoria. La M1 rappresenta il quattro in linea del 2025; la GSX-RR la versione 2022. Ogni moto dispone di quattro livelli di dettaglio e di un audio motore dedicato. Geometrie originali approssimate, senza asset di altri videogiochi; prestazioni e guida rimangono arcade.

Gli identificativi e l'ordine dei dieci veicoli e circuiti precedenti restano stabili: acquisti, potenziamenti e scelte salvate rimangono validi. I vecchi tempi e ghost restano nei backup; i nuovi percorsi usano record separati, perché distanze e coordinate sono cambiate. Le lobby comprendono l'intero catalogo. Per giocare insieme, aggiornare tutti i dispositivi alla versione attuale.

Dati delle piste: **© OpenStreetMap contributors, ODbL 1.0**. Coordinate e provenienza in `art/references/circuits.json`; conversione offline in `tools/build-circuits.mjs`. [Fonti e dettagli](art/references/README.md), disponibili anche nel gioco tramite il collegamento a `references.html`. Nomi e marchi appartengono ai rispettivi titolari. Progetto indipendente, senza affiliazione ufficiale.

## Stabilità e recupero

Al ritorno al menu vengono liberati moto degli avversari e ghost; il ghost si crea soltanto quando c’è un record da mostrare. Le allocazioni grafiche parziali vengono ripulite se la costruzione di una scena fallisce. Durante il cambio di qualità il gioco attende il caricamento dei modelli; un download interrotto conserva i modelli della qualità precedente e si può ritentare. I download hanno un timeout.

I pacchetti multiplayer e le risposte social incomplete vengono scartati senza sostituire i dati validi già caricati. La schermata di errore permette anche di **riprovare con grafica leggera**. Queste correzioni coprono i casi verificati nei test; il browser di verifica non dispone di WebGL, quindi non sostituiscono una prova 3D sui dispositivi reali.

## Sviluppo e pubblicazione

Richiede Node.js 22 o superiore e Python 3.10 o superiore.

```sh
npm ci
npm run build
npm run check
npm test
python -m unittest discover -s tests -p 'test_*.py'
python server.py --port 4173 --no-browser
```

Apri `http://localhost:4173/`. I file del client sono in `dist/`; `npm run build` prepara il client Supabase, le geometrie geografiche e il catalogo per la compatibilità LAN. Gli OBJ compressi e i modelli leggeri sono versionati. `art/create_models.py` rigenera i modelli originali; `npm run models:low` rigenera i livelli di dettaglio aggiunti. Gli OBJ non compressi sono esclusi da Git perché duplicano gli asset compressi e sono ricreabili.

Ogni aggiornamento su `main` esegue test, prepara i file e pubblica `dist/` tramite GitHub Actions. Nessun download manuale dell'HTML. Le modifiche a tabelle o funzioni Supabase si distribuiscono separatamente: lo schema documentato è in `backend/accounts.sql` e `backend/social-schema.sql`, il backend in `supabase/functions/apexgp-social/`. Il server LAN opzionale resta in `server.py`; Pages pubblica il client statico e usa Supabase per account, salvataggi, amici e partite online.
