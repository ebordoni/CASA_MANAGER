# Verifica della versione 0.3.0

Verifiche locali del 28 ottobre 2026:

- Build TypeScript/frontend/backend, 45 test di dominio/API/pubblicazione e controllo `check:public` superati.
- Nuovo avvio neutro e assenza di reimportazione su database già inizializzati verificati automaticamente. Fixture di dominio interamente sintetiche, fuori dall’immagine di produzione.
- Build Docker Linux amd64, backup/ripristino HTTP, persistenza dopo ricreazione del container e volume di collaudo eliminato dal motore Docker verificati.
- Dashboard rinominata e nuova configurazione controllate in Chrome. L’immagine nel README proviene da un’installazione neutra, senza dati personali.
- Nessuna vulnerabilità nelle dipendenze di produzione e nessun errore in `git diff --check`.
- Sorgenti e metadati Git ripuliti per la pubblicazione; la cronologia precedente è conservata privatamente fuori dal repository. La riscrittura non certifica la rimozione delle copie residue conservate da GitHub: vedere [pubblicazione](publication.md).

Le installazioni Home Assistant reali e l’architettura aarch64 restano da collaudare. Le verifiche precedenti sono riportate sotto come storico dei controlli locali.

# Verifica precedente della versione 0.2.1

Verifiche locali del 28 ottobre 2026 per il cambio font:

- `npm run build` e `git diff --check` superati.
- Font Noto Sans e licenza OFL inclusi negli artefatti statici, senza richieste a servizi font esterni.
- Interfaccia controllata in Chrome: testi e titoli usano Noto Sans; nessun errore di caricamento segnalato dal browser.
- Nessun nuovo test di dominio: la modifica riguarda font e metadati di versione. Le verifiche funzionali precedenti sono riportate sotto.

# Verifica precedente della versione 0.2.0

Verifiche locali del 28 ottobre 2026, su dati sintetici separati dai dati dell’utente:

| Controllo | Esito |
| --- | --- |
| Build TypeScript, frontend e backend | `npm run build` superato |
| Test di dominio e API | 42 superati, di cui 13 dedicati al nuovo ripristino |
| Ripristino completo | Database, file, hash, sessione/opzioni preservate e copie precedenti recuperabili |
| Casi di errore | ZIP non valido/troncato, file alterato, anteprima scaduta, modifiche concorrenti e errore sul puntatore senza sostituzione dei dati attivi |
| Concorrenza | Client obsoleti e upload già in corso bloccati dopo l’attivazione |
| Limiti e avvio | ZIP oltre 25 MB accettato dal limite dedicato; dataset attivo mancante rifiutato senza rigenerare il seed |
| Docker Linux amd64 | Build, login, ripristino via HTTP, seconda ricreazione container, dataset selezionato e download copia precedente verificati |
| Interfaccia | Impostazioni e finestra Carica backup controllate su desktop e a 390 × 844; annullamento verificato |
| Audit dipendenze produzione | Nessuna vulnerabilità rilevata |
| Whitespace Git | `git diff --check` superato |

Il caricamento automatico dal browser Chrome non è stato completato perché l’estensione richiede l’accesso agli URL dei file, non abilitato in questo ambiente. Upload, anteprima, conferma e download della copia precedente sono coperti dai test API e dalla prova HTTP nel container. Il ripristino sul dispositivo Home Assistant e l’Ingress reale restano da collaudare. Non sono stati importati backup nei dati attivi dell’utente.

Il bundle iniziale è circa 828 KB (247 KB gzip); rimane l’avviso informativo Vite sui chunk oltre 500 KB. Restano gli avvisi del runtime locale descritti nella verifica precedente. Il PDF non è stato modificato: la relativa verifica visiva rimane quella della versione 0.1.0.

# Verifica precedente della versione 0.1.0

Verifiche eseguite il 28 ottobre 2026 in locale. Non equivalgono a un collaudo sull’installazione Home Assistant dell’utente.

| Controllo | Esito |
| --- | --- |
| TypeScript strict e build frontend/backend | Superati con `npm run build` |
| Test di dominio e API | 29 superati, nessun fallimento |
| Audit dipendenze produzione | Nessuna vulnerabilità rilevata |
| Docker Linux amd64 | Immagine compilata e avviata |
| Ricreazione container | Login, protezione percorsi codificati e persistenza verificati da `scripts/container-smoke.mjs` |
| Backup/ripristino | Database, manifest e file originali ripristinati e verificati con SHA-256; destinazioni non vuote rifiutate |
| Interfaccia desktop | Dashboard, calendario, attività salvata realmente, scenari e archivio controllati nel browser |
| Interfaccia smartphone | Layout a 390 × 844, menu e scelta operazione controllati; viewport poi ripristinato |
| PDF | Report di 9 pagine A4 reso con Poppler e verificato visivamente; anteprima PDF nell’app aperta correttamente in Chrome |
| Docker Compose | Configurazione validata senza esporre password nei log |
| Whitespace Git | `git diff --check` superato |

I dati temporanei creati durante le prove dell’interfaccia sono stati rimossi; ne resta la cronologia nell’audit. Database e artefatti di prova sono esclusi dal controllo versione.

Il bundle JavaScript iniziale è circa 818 KB, 245 KB gzip: Vite segnala il superamento della soglia informativa di 500 KB. La build riesce. Il runtime locale Node 24.11.1 emette l’avviso di sperimentalità di `node:sqlite`; il relativo uso è coperto dalle prove di persistenza e ripristino. npm 12 locale segnala una versione Node inferiore al proprio intervallo consigliato, pur completando installazione e verifiche. L’immagine di produzione usa Node 24 Alpine.

Restano da eseguire sul dispositivo: installazione dell’add-on, apertura dell’Ingress reale, caricamento documenti dal browser mobile, riavvio e backup/ripristino Supervisor. L’immagine aarch64 è dichiarata nel packaging ma non è stata compilata o eseguita in questo ambiente. Non sono stati inviati messaggi a contatti né comandati altri add-on o dispositivi.
