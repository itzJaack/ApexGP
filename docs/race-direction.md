# Direzione gara — ApexGP 4.11

## Regole di riferimento

[FIM GP Sporting Regulations, aggiornamento 13 settembre 2026](https://www.fim-moto.com/fileadmin/2026_GP_Sporting_Regulations_-_Updates_13_Sept__26.pdf), sezioni 1.19.1, 1.19.2 e 1.22.2; [guida ufficiale MotoGP alle bandiere](https://www.motogp.com/it/news/2025/04/02/how-does-the-flag-system-work-in-motogpx/522932).

- Gialla singola: pericolo accanto alla pista; doppia: ostacolo sulla pista. Rallentare, essere pronti a fermarsi e non sorpassare fino al verde. Restituire subito una posizione guadagnata evita la sanzione successiva.
- Il regolamento reale prevede long lap. Su richiesta del giocatore ApexGP li sostituisce con passaggi manuali ai box: questa sostituzione non è una regola MotoGP.
- Ride-through: transito nella pit lane senza fermarsi, massimo 60 km/h. La bandiera nera esclude il pilota dalla classifica e dai punti. Le penalità pendenti sopravvivono alla ripartenza.

## Adattamenti dichiarati del gioco

La FIM prevede un rientro lento ai box durante la rossa. ApexGP mantiene una frenata progressiva e una ripartenza da fermi per la struttura attuale delle gare. Il cronometro ufficiale si ferma mentre moto e cadute continuano a muoversi. Un blocco locale persistente di almeno cinque moto distribuite sulla carreggiata può causare la rossa; incidenti lontani fra loro restano gialle indipendenti. I settori S1/S2/S3 riassumono zone commissari di circa 180 m, non un rilievo delle vere postazioni.

La valutazione automatica non sostituisce il giudizio dei commissari reali: usa contatti posteriori chiaramente pericolosi, ripetizione, vantaggio nei tagli, e superamento confermato sotto gialla. Un tocco laterale da solo non stabilisce colpa. Restituire una posizione non penalizza chi la riceve. Le finestre di 12 secondi per restituire una posizione, 8 secondi per una persistente ostruzione sotto blu, la tolleranza dei track limits e gli equivalenti finali sono scelte di gioco. Un passaggio ai box non scontato vale un equivalente minimo di 15 s derivato dal percorso; lo stop-and-go aggiunge cinque secondi. Non sono sanzioni FIM universali per qualsiasi incidente.

B / MOSTRA BOX evidenzia il percorso sulla mappa senza prendere il controllo della moto. Il ride-through richiede l'intero passaggio a non oltre 60 km/h; lo stop-and-go aggiunge cinque secondi consecutivi fermi nel riquadro giallo. Uscire dalla corsia, tagliare, superare il limite, andare contromano, cadere o usare il reset invalida il passaggio. La rossa non permette di scontare. Tre giri concessi: ignorare un ride-through porta allo stop-and-go; ignorare quest'ultimo porta alla squalifica. I bot percorrono lo stesso tragitto e si fermano realmente. Tempi aggiunti e retrocessioni modificano il risultato finale, non il cronometro del giro; i giri neutralizzati o tagliati non aggiornano il record.

In multiplayer il creatore della stanza applica lo stesso regolamento a umani e bot. I giocatori devono attraversare i checkpoint del percorso a velocità consentita; una richiesta di servizio o un salto al punto finale non bastano. Il tragitto futuro dei bot è descritto con un piano compatto, ricostruito in modo identico dai client. Non è un sistema anti-cheat contro un host ostile. I bot multiplayer seguono profili deterministici con aderenza limitata; la fisica completa di contatto e caduta fra tutti gli avversari rimane nelle gare singole.

## Provenienza delle corsie

Tutti i 22 circuiti hanno una corsia con provenienza documentata. Misano e Assen sostituiscono i vecchi percorsi sintetici con tracciamenti da foto; Le Mans usa i raccordi moto. Fonti e limiti sono in [pit lane](pit-lanes.md). Le vecchie sanzioni long lap diventano passaggi ai box, non vengono cancellate. Gli equivalenti finali sono almeno 15 s, più 5 s per lo stop-and-go.

## Qualifiche di carriera

Formato [MotoGP](https://www.redbullring.com/en/news/motogp-trainings-qualifyings-sprint-race-explained/): Practice, primi dieci direttamente in Q2; gli altri dieci disputano Q1, i primi due passano in Q2. Q2 assegna i primi dodici posti, gli altri otto seguono l'ordine Q1. Ogni turno dura cinque minuti, adattamento richiesto; le gare di carriera durano cinque giri, anche nelle stagioni precedenti ancora aperte.

I tempi derivano da giri fisicamente percorsi. Il giro di lancio non conta; tagli, cadute, reset e gialle annullano il giro. Allo zero si può completare un giro veloce già iniziato, senza iniziarne un altro. Giro di rientro e fine anticipata del proprio turno lasciano completare gli avversari con simulazione accelerata. Lo stesso accade quando il giocatore non partecipa a Q1 o Q2.

Un intralcio continuativo a chi è in giro veloce, fuori dal proprio giro veloce e sulla sua linea, costa tre posti in griglia, anche ai bot. Questo criterio automatico e l'arretramento fisso sono scelte di gioco; i commissari reali valutano ogni episodio. I bot rallentano fuori dal giro veloce e cercano spazio quando qualcuno arriva in un giro cronometrato.

Cronometro, tempi e sanzioni si salvano ogni cinque secondi simulati, in pausa e all'uscita. Rientrare conserva i dati già registrati; il giro interrotto riparte come giro di lancio. Qualificarsi non assegna crediti e non fa avanzare il campionato. La fine di Q2 mostra la griglia con le penalità prima della gara. I risultati storici e il garage restano conservati.

I documenti FIM sono collegati alla fonte ufficiale; il PDF non è incluso nel repository o nella distribuzione.
