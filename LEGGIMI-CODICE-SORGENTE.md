# ApexGP 3.4 — codice sorgente completo

Questo archivio raccoglie i file della release 3.4 e ripristina anche i 22 file
Wavefront OBJ non compressi dagli identici asset usati dal gioco. I file del
programma della release sono conservati senza modifiche.

## Dove intervenire

- `dist/index.html`, `dist/styles.css`: interfaccia e stile.
- `dist/game.js`: ciclo di gioco, menu e collegamento dei sistemi.
- `dist/simulation.js`, `dist/controls.js`: fisica, circuiti, moto e comandi.
- `dist/engine.js`, `dist/models.js`: rendering WebGL e importazione OBJ/MTL.
- `dist/audio.js`: sintesi audio.
- `dist/progression.js`: economia e potenziamenti.
- `dist/race-control.js`, `dist/race-bots.js`: bandiere e avversari.
- `dist/cloud-multiplayer.js`, `dist/realtime.js`, `dist/net-codec.js`: multiplayer Supabase.
- `dist/social.js`, `dist/social-ui.js`: amicizie e inviti.
- `dist/online-config.js`: URL e chiave publishable pubblica del progetto.
- `supabase/functions/apexgp-social/`: sorgenti della Edge Function social.
- `backend/social-schema.sql`: schema SQL del sistema amici.
- `server.py`, `online.py`, `dist/lan.js`: server LAN e alternativa con tunnel.
- `dist/assets/models/`: 22 OBJ (10 moto e pilota, ciascuno in high e race),
  MTL, texture PNG e le copie OBJ gzip utilizzate dal gioco.
- `art/create_models.py`: generatore dei modelli (NumPy, SciPy e Pillow).
- `data/`: dati dei circuiti.
- `tests/`: test JavaScript e Python.
- `tools/build_release.py`: generatore della release HTML autonoma.

La cartella si chiama `dist`, ma contiene i moduli JavaScript modificabili,
HTML e CSS del gioco; non serve un framework o una compilazione JavaScript.
Non sono inclusi segreti amministrativi del backend, credenziali personali
o salvataggi dei giocatori. La configurazione pubblica del client è quella
della release 3.4; i segreti necessari al backend provengono dal suo ambiente.

## Aprire e modificare

Per giocare subito apri `APEX-GP-v3.4.html`. Per vedere le modifiche ai moduli,
apri un terminale nella cartella e avvia:

```sh
python server.py --host 127.0.0.1 --port 4173 --no-browser
```

Su Windows puoi usare `py` al posto di `python`; su Linux/macOS `python3`.
Apri poi http://127.0.0.1:4173. Il server locale serve i file durante lo
sviluppo; il multiplayer online resta collegato a Supabase.

## Rigenerare il file HTML

```sh
python tools/build_release.py release
```

I risultati sono nella cartella `release/`. Modificare un modulo in `dist/`
non modifica automaticamente l'HTML autonomo già generato: occorre rigenerarlo.
Gli asset OBJ compressi devono essere aggiornati se si cambiano quelli raw;
il generatore `art/create_models.py` produce entrambe le versioni.

## Controlli disponibili

Con Node.js installato:

```sh
npm run check
npm test
```

Test Python del server:

```sh
python -m unittest discover -s tests -p "test_*.py"
```

L'HTML rigenerato dai moduli di questo archivio è stato confrontato byte per
byte con l'HTML della release 3.4: coincidono. `SHA256SUMS.txt` contiene le
impronte dei file per controllare l'integrità del pacchetto.

Per il backend già configurato e le sue regole di accesso, leggi
`backend/README.md`. Questo archivio non modifica né pubblica il servizio.
