# Changelog

## 0.3.0 - 2026-10-28

- Nome visibile dell’app, add-on, report ed esportazioni aggiornato a home manager.
- Nuove installazioni con operazione vuota e impostazioni neutre; dati già salvati e backup precedenti compatibili.
- Dati dimostrativi sintetici separati dai dati iniziali di produzione; riferimenti personali rimossi da sorgenti e documentazione.
- Controllo automatico dei file destinati alla pubblicazione e protezioni Git/Docker per dati privati, archivi e credenziali.
- Smoke test Docker con volume temporaneo dedicato, per evitare errori di permessi durante la pulizia sui runner Linux.

## 0.2.1 - 2026-10-28

- Font Noto Sans per testi, titoli, date e importi dell’interfaccia, incluso localmente nell’app per funzionare senza servizi esterni.

## 0.2.0 - 2026-10-28

- Ripristino dei backup completi da Impostazioni, anche tramite Home Assistant Ingress: upload, verifica, riepilogo e conferma esplicita.
- Attivazione del dataset verificato senza riavvio e conservazione dei dati precedenti, scaricabili e reimportabili dall’interfaccia.
- Preservazione delle opzioni dell’add-on e delle sessioni; protezione dalle scritture di finestre obsolete e dagli upload documentali in corso.
- Compatibilità con i backup 0.1.0, limiti di upload e decompressione e rifiuto dei backup non integri o incompatibili.
- Il dataset attivo e le copie precedenti sono indicizzati in `active-dataset.json`: per un downgrade a 0.1.0 usare un backup separato, senza riutilizzare direttamente il volume dopo un ripristino.

## 0.1.0 - 2026-10-28

- Prima versione del gestionale con importazione iniziale configurabile.
- React, Mantine 9, Fastify, SQLite con migrazioni, audit e controlli delle revisioni.
- Archivio documentale privato, versioni, hash, anteprime e verifica manuale.
- Attività, obblighi, calendario, mutui, scenari, movimenti e checklist del rogito.
- Report PDF, CSV e JSON; archivio ZIP, backup coerente e ripristino verificato.
- Packaging per Home Assistant OS con Ingress e alternativa Docker Compose.
