# Backend ApexGP 4.0

Il progetto rimane `vpdurolhulwsoahbtaho`, regione eu-central-1. La Edge Function `apexgp-social` gestisce account con nome utente e password, recupero, collegamento dei profili preesistenti, amicizie e inviti. Il trasporto di gara rimane Supabase Realtime.

## Account

`register_account` valida nome e password, applica limiti per IP e nome e crea l'utente attraverso l'API amministrativa di Supabase Auth. L'indirizzo interno `nome@accounts.apexgp.invalid` serve come identificatore per Auth e non riceve email. Il browser accede attraverso il normale `signInWithPassword` e usa il JWT di Supabase per le operazioni successive. La chiave service-role resta esclusivamente nelle variabili d'ambiente della funzione. I dati di registrazione e i codici non sono registrati nei log applicativi.

Il codice di recupero contiene 256 bit casuali. Il database conserva soltanto SHA-256 in `apex_account_recovery`, senza accesso diretto da anon o authenticated. `reset_account` verifica il codice e aggiorna la password tramite Auth. Il codice resta valido fino alla rigenerazione da parte dell'utente autenticato; `rotate_recovery` invalida immediatamente quello precedente. Il codice non viene salvato automaticamente nel browser: il giocatore lo può scaricare esplicitamente.

`account_profile` verifica il JWT tramite Auth, associa il profilo ad `auth_user_id` e, quando il browser presenta un vecchio accesso valido, conserva il profilo amici precedente. Il vecchio accesso viene revocato al collegamento. La versione legacy continua a funzionare per i profili non ancora collegati. La creazione del profilo sociale è idempotente durante un accesso normale; in caso di errore di rete si può riprovare dal profilo.

## Salvataggi

`apex_saves` è accessibile soltanto all'utente il cui UUID coincide con `auth.uid()`. Nessun accesso anonimo. Le operazioni di aggiornamento includono il numero di revisione letto: una copia vecchia ottiene zero righe aggiornate e il client propone la risoluzione del conflitto. Il trigger richiede incrementi di una sola revisione e impedisce di cambiare proprietario. Le modifiche non inviate restano nella cache locale di ciascun account. La scelta grafica rimane locale.

Lo schema sorgente è in `accounts.sql`; la migrazione social precedente è in `social-schema.sql`. Le migrazioni sono già applicate al progetto. Non rieseguire il file intero su un database esistente: per un aggiornamento crea una migrazione incrementale.

## Amici e inviti

I profili social, le amicizie, gli inviti e i contatori rimangono privati al servizio. Il JWT viene verificato dal server per i profili collegati. Per i vecchi profili resta l'accesso casuale originale, con il solo hash in Postgres. `verify_jwt` rimane disabilitato sul gateway perché la funzione verifica sia JWT Auth sia accessi legacy; non esistono azioni social autenticate dal solo apikey pubblico.

Le amicizie richiedono accettazione; solo gli amici possono invitarsi. Il codice di una stanza è restituito esclusivamente al destinatario dell'invito. Gli inviti scadono dopo sei minuti. Il polling degli amici non trasporta le pose delle moto. La fisica di gara è locale e non è un sistema competitivo autoritativo.

## Verifiche

Test del client per account isolati, cache offline e conflitti. Verifiche reali su Supabase: registrazione, accesso, recupero e rigenerazione codice; due browser con sincronizzazione di un acquisto; RLS contro lettura e scrittura fra account; revisione obsoleta; amicizie, accettazione e invito fra soli profili di prova. I profili sintetici usati per queste verifiche vengono rimossi al termine.
