# Architettura

## Home Assistant

home manager usa la porta interna **8104**, architetture `amd64` e `aarch64`, singolo Dockerfile multistadio, `config.yaml` alla radice (il Supervisor cerca la configurazione anche a questo livello). Non duplica il sorgente in una cartella di packaging. Non chiede `homeassistant_api`: il gestionale non deve comandare dispositivi o leggere stati HA.

La base Node non include S6: si usa l’init del container, diversamente dagli add-on con immagini base HA che devono impostare `init: false`. Il backup Supervisor è `cold`. Non vengono copiate impostazioni non necessarie come `host_network`, mount di configurazione o porte per OAuth.

## Strati

- `web/`: React, componenti Mantine, Mantine Form, Dates e Notifications. Navigazione hash, URL API relativi, layout desktop/mobile. Nessun dato applicativo viene affidato a localStorage.
- `shared/model.ts`: descrittori tipizzati, validazioni Zod condivise, etichette italiane, importi in centesimi e formule finanziarie pure.
- `server/app.ts`: controller HTTP, autenticazione, protezione origine, errori centralizzati, download e gestione multipart.
- `server/service.ts`: regole di dominio, dipendenze, evidenze, transizioni, ricorrenze, dashboard e flussi finanziari.
- `server/database.ts`: repository con query parametrizzate, transazioni e audit.
- `server/documents.ts`: archiviazione privata, versioni immutabili, hash e verifica integrità.
- `server/reports.ts`, `server/backup.ts`: esportazioni e ripristino controllato.
- `migrations/`: schema relazionale numerato e versionato. Non viene generato dallo schema client all’avvio.

Fastify offre un ciclo richieste esplicito, log strutturati e test HTTP senza aprire porte. Zod è utilizzato sugli ingressi delle API e negli stessi moduli client. Le impostazioni di storage e autenticazione arrivano dall’ambiente, quelle Supervisor da `options.json`.

La configurazione iniziale neutra è importata da `initial-data.json`, modificabile e separato dal codice. L’importazione è atomica e avviene soltanto su un database senza operazioni; i collegamenti simbolici vengono risolti in UUID persistenti. Si può sostituire il file con `INITIAL_DATA_FILE` senza cambiare le regole di dominio.

## Modello relazionale

Operazione → transazioni → immobili, persone/organizzazioni collegate tramite TransactionParty. Immobili → unità catastali. Documenti → versioni immutabili; collegamenti documentali con FK esplicite a attività, obblighi, clausole, movimenti, scadenze e lavori. Contratti → clausole → obblighi. Attività → checklist interne e dipendenze. Scadenze contrattuali e appuntamenti sono tabelle autonome. Pratiche e offerte mutuo, scenari e movimenti sono separati. Lavori → preventivi e fornitori; comunicazioni e decisioni sono registri interrogabili.

`MortgageApplication` è chiamata `mortgages`; `FinancialMovement` è `movements`; `FinancialScenario` è `scenarios`; `WorkItem` è `works`; `CostEstimate` è `estimates`; `AppSetting` è `settings`. `Attachment` coincide con `document_versions`: anche foto, fatture e comunicazioni allegate passano attraverso il medesimo archivio, con collegamenti espliciti. Nessun dato operativo filtrabile è nascosto in colonne JSON. Il JSON è usato solo per gli snapshot immutabili dell’audit.

Ogni record ha UUID, revisione e timestamp UTC. Date senza ora sono ISO `YYYY-MM-DD`; appuntamenti sono istanti ISO con offset, visualizzati nel fuso Europe/Rome. Le FK bloccano eliminazioni che romperebbero collegamenti. Le scritture di dominio e il relativo audit sono atomici. L’API richiede la revisione per aggiornare o eliminare.

## Attivazione dei backup dall’interfaccia

`server/restore-manager.ts` gestisce upload in streaming, verifica e conferma. Il ZIP viene estratto in `/data/restore-staging/<id>`; la versione attiva non viene toccata. La conferma confronta il token dello stato corrente, verifica nuovamente dati e file e sposta il dataset in `/data/datasets/<id>`. `server/storage.ts` aggiorna con una sola rinomina atomica il catalogo `active-dataset.json`, che contiene anche il registro dei ripristini e i riferimenti alle copie precedenti. Il puntatore viene scritto soltanto dopo aver aperto con successo il nuovo database.

L’istanza del repository resta condivisa dai servizi, mentre la connessione e il percorso documenti passano al nuovo dataset. Il vecchio database viene chiuso e conservato; `options.json` e `session.key` rimangono nella radice. In assenza di catalogo, la cartella dati originale rimane compatibile (`legacy`). Al riavvio il repository e il backup CLI leggono il dataset selezionato dal catalogo. I record di audit del backup restano invariati: la transizione tra dataset è registrata nel catalogo atomico.

Il client riceve la generazione del dataset nel bootstrap. Le scritture su dati obsoleti e gli upload iniziati prima del ripristino vengono bloccati. La verifica scade dopo un’ora ed è annullabile; lo spazio dei dataset precedenti non viene eliminato automaticamente. Le copie si possono scaricare e reimportare senza rimettere in uso direttamente un dataset archiviato. Non sono necessari riavvii, API Supervisor, porte host o mount aggiuntivi. Un solo processo applicativo deve usare il volume dati.

## Regole economiche

Lo scenario parte dal saldo prezzo, già al netto della caparra. Sottrae dall’incasso lordo di vendita una sola estinzione e usa un solo aggregato di costi futuri, lavori inclusi. Le ipotesi scenario non vengono sommate ai movimenti del registro.

Il flusso di cassa richiede un saldo di apertura esatto, confermato e datato. I movimenti già effettivi fino a quel giorno sono inclusi nel saldo e non vengono riapplicati. Un’entrata diventa effettiva nella progressione solo se incassata e con data di disponibilità. I trasferimenti dello stesso giorno sono segnalati e ordinati prudenzialmente mettendo le uscite per prime; non viene dedotta una disponibilità intragiornaliera. Nessuna delibera, vendita prevista, TFR o incentivo genera automaticamente un incasso.

## Sicurezza e crescita

File privati indirizzati tramite hash, nomi originali solo nei metadati; limiti upload e controllo delle firme principali dei formati. Nessuna cartella documenti è pubblica. Login con cookie firmato, HttpOnly e SameSite Strict per il servizio autonomo; password necessaria per binding non loopback. Per Ingress si verifica l’IP del proxy, non un header simulabile. L’health check non espone dati personali. I log non registrano contenuti dei form, cookie o documenti.

SQLite WAL è adeguato alla famiglia: un processo applicativo, poche scritture simultanee e storage locale. Passare a PostgreSQL quando servono più repliche backend, utenti/gruppi con permessi granulari, molti scrittori simultanei o storage remoto condiviso. Il filesystem dei documenti deve allora diventare un archivio comune controllato, mantenendo hash e versioni. I dati non sono cifrati a riposo dall’app: usare storage e backup protetti. Non montare il volume SQLite su NFS/SMB.

Fonti ufficiali consultate: [Mantine e Vite](https://mantine.dev/guides/vite/), [Mantine DateInput](https://mantine.dev/dates/date-input/), [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [configurazione add-on](https://contributors.home-assistant.io/apps/reference/configuration/), [installazioni Home Assistant](https://www.home-assistant.io/installation/).

## Compatibilità del nome

Il nome visibile è `home manager`. Lo slug add-on `casa_manager`, il volume Compose `casa_data`, il database `casa.sqlite`, il cookie di sessione e il formato archivio `casa-manager-backup` restano invariati per riconoscere installazioni e backup precedenti. Il nome del servizio Compose e dell’immagine Docker è `home-manager`. Le fixture in `test/fixtures` sono sintetiche e non vengono incluse nell’immagine di produzione.
