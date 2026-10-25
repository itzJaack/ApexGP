# ApexGP 4.0

Gioco di corse in moto 3D per browser. **[Gioca su GitHub Pages](https://itzjaack.github.io/ApexGP/)** · [Sorgenti e aggiornamenti](https://github.com/itzJaack/ApexGP).

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

## Grafica e circuiti

**Prestazioni** è l'impostazione iniziale. Usa un massimo di 1280×720 pixel interni, risoluzione adattiva dal 60% al 100%, shader semplificato, nessuna mappa delle ombre o post-processing, modelli dedicati e sezioni del mondo escluse dal disegno quando non visibili. Moto e pilota principali passano a circa 21 mila triangoli; gli avversari a meno di 10 mila. **Cinema** conserva i modelli dettagliati e l'illuminazione completa. La scelta grafica resta locale al dispositivo. L'obiettivo è facilitare l'uso su GPU integrate come Intel HD 530; non è stato eseguito un benchmark su un i7-6700 reale.

I circuiti hanno corsia box, segnaletica dei settori e delle frenate, vie di fuga dipinte, tribune, paddock, mezzi di servizio e posizionamento degli edifici controllato rispetto all'intero percorso. I nomi sono quelli reali; i modelli 3D, i tracciati, le distanze e le prestazioni rimangono interpretazioni arcade originali, non repliche ufficiali. Gli identificativi interni restano compatibili con garage e lobby delle versioni precedenti. Per le partite fra amici usa la stessa versione su tutti i dispositivi.

Riferimenti dei nomi: [calendario ufficiale MotoGP](https://www.motogp.com/en/calendar), [Yamaha YZR-M1](https://www.yamaha-racing.com/series/grand-prix/motogp/bike/), [Ducati](https://www.ducati.com/), [Aprilia Racing](https://www.aprilia.com/), [KTM](https://www.ktm.com/). Nomi e marchi appartengono ai rispettivi titolari. Progetto indipendente, senza affiliazione ufficiale.

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

Apri `http://localhost:4173/`. I file del client sono in `dist/`; `npm run build` prepara il client Supabase e il catalogo per la compatibilità LAN. Gli OBJ compressi e i modelli leggeri sono versionati. `art/create_models.py` rigenera i modelli originali; `npm run models:low` rigenera i livelli di dettaglio aggiunti. Gli OBJ non compressi sono esclusi da Git perché duplicano gli asset compressi e sono ricreabili.

Ogni aggiornamento su `main` esegue test, prepara i file e pubblica `dist/` tramite GitHub Actions. Nessun download manuale dell'HTML. Le modifiche a tabelle o funzioni Supabase si distribuiscono separatamente: lo schema documentato è in `backend/accounts.sql` e `backend/social-schema.sql`, il backend in `supabase/functions/apexgp-social/`. Il server LAN opzionale resta in `server.py`; Pages pubblica il client statico e usa Supabase per account, salvataggi, amici e partite online.
