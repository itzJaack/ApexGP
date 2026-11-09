# Direzione gara — ApexGP 4.8

## Regole di riferimento

[FIM GP Sporting Regulations, aggiornamento 13 settembre 2026](https://www.fim-moto.com/fileadmin/2026_GP_Sporting_Regulations_-_Updates_13_Sept__26.pdf), sezioni 1.19.1, 1.19.2 e 1.22.2; [guida ufficiale MotoGP alle bandiere](https://www.motogp.com/it/news/2025/04/02/how-does-the-flag-system-work-in-motogpx/522932).

- Gialla singola: pericolo accanto alla pista; doppia: ostacolo sulla pista. Rallentare, essere pronti a fermarsi e non sorpassare fino al verde. Restituire subito una posizione guadagnata evita la sanzione successiva.
- Long lap entro 3 giri; mancato adempimento: doppio long lap entro 5, quindi ride-through entro 3, infine bandiera nera. Il conteggio parte dal primo passaggio sul traguardo dopo la notifica. Una zona long lap neutralizzata estende la finestra; non si può scontare durante la gialla.
- Ride-through: transito nella pit lane senza fermarsi, massimo 60 km/h. La bandiera nera esclude il pilota dalla classifica e dai punti. Le penalità pendenti sopravvivono alla ripartenza.

## Adattamenti dichiarati del gioco

La FIM prevede un rientro lento ai box durante la rossa. ApexGP mantiene una frenata progressiva e una ripartenza da fermi per la struttura attuale delle gare. Il cronometro ufficiale si ferma mentre moto e cadute continuano a muoversi. Un blocco locale persistente di almeno cinque moto distribuite sulla carreggiata può causare la rossa; incidenti lontani fra loro restano gialle indipendenti. I settori S1/S2/S3 riassumono zone commissari di circa 180 m, non un rilievo delle vere postazioni.

La valutazione automatica non sostituisce il giudizio dei commissari reali: usa contatti posteriori chiaramente pericolosi, ripetizione, vantaggio nei tagli, e superamento confermato sotto gialla. Un tocco laterale da solo non stabilisce colpa. Restituire una posizione non penalizza chi la riceve. Le finestre di 12 secondi per restituire una posizione, 8 secondi per una persistente ostruzione sotto blu, la tolleranza dei track limits e gli equivalenti finali sono scelte di gioco. Un long lap non scontato vale 3 s per passaggio, il ride-through un equivalente minimo di 15 s derivato dal percorso. Non sono sanzioni FIM universali per qualsiasi incidente.

B / SCONTA attiva la guida al percorso: la moto rallenta, entra e attraversa realmente la corsia, condivisa con i bot. Il ride-through non richiede una sosta. Tempi aggiunti e retrocessioni modificano il risultato finale, non il cronometro del giro; i giri neutralizzati o tagliati non aggiornano il record. Le gare singole aspettano la classificazione degli avversari dopo il proprio arrivo.

In multiplayer il creatore della stanza applica lo stesso regolamento a umani e bot. I giocatori devono attraversare i checkpoint del percorso a velocità consentita; una richiesta di servizio o un salto al punto finale non bastano. Il tragitto futuro dei bot è descritto con un piano compatto, ricostruito in modo identico dai client. Non è un sistema anti-cheat contro un host ostile. I bot multiplayer seguono profili deterministici con aderenza limitata; la fisica completa di contatto e caduta fra tutti gli avversari rimane nelle gare singole.

## Provenienza delle corsie

I dati sono gli estratti OpenStreetMap già attribuiti in `art/references/scenery/` (© OpenStreetMap contributors, ODbL). Il runtime conserva `sourceIds` e `approximate` per ogni percorso. Venti circuiti dispongono di una pit lane mappata, compresi tutti gli otto nuovi, e sette di un long lap nominato. Buriram, Brno e Balaton usano identificativi espliciti per corsie mappate senza nome; quella di Balaton è una `highway=service`. Le quote provengono dallo stesso terreno del gioco. I raccordi alla pista sono adattati al gioco anche quando il nucleo della corsia è mappato. Dove manca la corsia è generato un percorso approssimato: non viene presentato come rilevamento esatto del circuito reale.

I documenti FIM sono collegati alla fonte ufficiale; il PDF non è incluso nel repository o nella distribuzione.
