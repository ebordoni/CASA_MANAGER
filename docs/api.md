# API REST

Base URL relativa `./api/`, compatibile con Ingress. JSON UTF-8, importi in centesimi EUR, date ISO e UUID stabili. Risposte di errore `{ "message": "..." }`, con `issues` per gli errori di validazione. Codici: 401 accesso richiesto, 403 origine/accesso non valido, 404 assente, 409 conflitto revisione/vincolo/transizione, 422 dati non validi, 429 limite richieste, 500 errore interno senza dettagli privati.

## CRUD

Le entità e i campi sono documentati da `/api/openapi.json` e `shared/model.ts`.

- `GET /api/entities/:entity`: elenco record.
- `POST /api/entities/:entity`: oggetto completo dei campi applicativi, ID generato dal server.
- `PUT /api/entities/:entity/:id`: `{ "revision": 1, "data": { ... }, "confirmTransition": false }`. Sostituzione completa; campi opzionali omessi azzerati. Non inviare ID o timestamp dentro `data`.
- `DELETE /api/entities/:entity/:id`: `{ "revision": 1, "confirmTitle": "titolo esatto" }`. Vincoli referenziali rispettati. Per documenti senza collegamenti elimina versioni e file; l’audit mantiene traccia dei metadati rimossi.

## Letture operative

- `GET /api/health`: stato e versione, senza autenticazione né dati familiari.
- `GET /api/bootstrap`: snapshot di tutte le tabelle, dashboard e `generation` del dataset attivo.
- `GET /api/dashboard`: attività, scadenze, documenti da gestire, checklist e risultati scenari.
- `GET /api/cash/:operationId`: saldo apertura noto/ignoto, progressione effettiva/prevista e movimenti esclusi.
- `GET /api/reminders`: promemoria interni secondo i preavvisi configurati.

## Documenti

- `POST /api/documents/:id/versions`: multipart con un campo file; header `If-Match: <revisione documento>`. Massimo 25 MB. Ogni upload crea una versione nuova e invalida la verifica; un hash già presente risponde 409.
- `GET /api/versions/:id/file`: originale come attachment; `?inline=true` consente anteprima soltanto per PDF e immagini. Ogni lettura controlla l’hash.
- `GET /api/documents/compare?before=<versionId>&after=<versionId>`: confronto metadati e hash di versioni appartenenti allo stesso documento.

## Autenticazione

- `GET /api/auth/status`: necessità login e stato corrente.
- `POST /api/auth/login`: `{ "password": "..." }`, cookie firmato valido 12 ore, massimo 5 tentativi/minuto per IP.
- `POST /api/auth/logout`: cancella il cookie.

Ingress usa la sessione HA e ammette soltanto il proxy Supervisor. Il servizio su loopback può lavorare senza login; su rete richiede password di almeno 16 caratteri. Nessuna password deve essere inviata in query string.

## Esportazioni

- `GET /api/export/json`: dati completi e metadati versioni, senza i byte dei file.
- `GET /api/export/csv/:entity`: colonne stabili, quoting CSV e protezione formule; importi grezzi in centesimi.
- `GET /api/export/pdf/:scope`: `all`, nome entità, `missing-documents`, `open-obligations`, `completed-tasks`.
- `GET /api/export/archive`: ZIP organizzato per documento/versione con manifest e JSON.
- `GET /api/backup`: ZIP con SQLite coerente, originali indirizzati per hash, JSON e manifest verificabile.

Le esportazioni complete riguardano tutte le operazioni del dataset attivo e possono contenere dati personali. Le copie precedenti ai ripristini vengono esportate separatamente. Rimane disponibile il ripristino offline (`npm run restore`) con destinazione nuova/vuota.

## Ripristino dall’interfaccia (0.2.0)

Tutti gli endpoint richiedono lo stesso accesso e la stessa protezione origine delle altre API. In Ingress sono ammessi solo i collegamenti dal proxy Supervisor.

- `GET /api/restores`: limite upload e `recoveryPoints` disponibili, senza percorsi interni del filesystem.
- `POST /api/restores/preview`: multipart con un solo file ZIP, massimo 512 MB. Restituisce `id`, nome file, data del backup, operazioni, conteggi del backup e dei dati attuali, `expiresAt` ed `expectedState`. Non modifica i dati attivi. Massimo 5 tentativi ogni 10 minuti per IP e 3 verifiche non scadute in archivio.
- `POST /api/restores/:id/confirm`: `{ "expectedState": "<valore ricevuto>", "confirmation": "RIPRISTINA" }`. Restituisce `generation` e `recoveryPointId`. Tutte le operazioni vengono sostituite dal dataset verificato; non viene eseguito un merge. La copia precedente resta privata e recuperabile. Una verifica scaduta restituisce 410; dati modificati dopo l’anteprima restituiscono 409.
- `DELETE /api/restores/:id`: annulla una verifica in modo idempotente e rimuove i soli file temporanei, senza modificare i dati attivi.
- `GET /api/restores/recovery/:id/backup`: ZIP completo dei dati precedenti al ripristino. Si può importare con gli stessi endpoint per tornare indietro.

Dopo ogni bootstrap il client conserva `generation` e la invia nell’header `X-Casa-Generation` per le scritture alle entità e i caricamenti documentali. Dopo il primo ripristino, una generazione mancante o diversa restituisce 409: il client deve ricaricare il bootstrap prima di proseguire. Anche un upload documentale iniziato sul vecchio dataset viene rifiutato se termina dopo un ripristino.

Il formato del backup resta alla versione 1. Limiti: 2 GB decompressi, 10.000 file, 256 MB per elemento ZIP e 100.000 record. Dati e formati incompatibili, percorsi estranei al backup e hash alterati vengono rifiutati prima dell’attivazione.
