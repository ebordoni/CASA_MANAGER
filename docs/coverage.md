# Copertura e limiti della versione iniziale

Tutti i tredici moduli di navigazione usano dati persistenti e API. I moduli condividono editor, dettaglio con audit, filtri, feedback e conferma eliminazione. Le entità sono relazionali; il riuso del controller CRUD non implica dati salvati come blob JSON.

| Area | Implementazione | Limite esplicito |
| --- | --- | --- |
| Operazioni e transazioni | Stati configurabili, dipendenze, prezzi/date indipendenti, immobili e parti | Transizioni non ordinarie confermate manualmente; nessuna attestazione giuridica |
| Immobili | Superfici distinte, unità catastali multiple, rendite, impianti, problemi, note | Fotografie conservate come documenti collegati all’immobile |
| Documenti | Originali privati, versioni, hash, duplicati, filtri, preview, confronto e ZIP | Confronto visivo PDF/immagini; nessun diff semantico PDF/OCR |
| Calendario e attività | Mese/settimana, scadenze autonome, checklist, dipendenze e ricorrenze | Ricorrenza settimanale/mensile alla chiusura dell’attività; nessun motore RRULE completo |
| Contratti | Clausole, obblighi, prove e audit delle modifiche | Articoli/testi iniziali lasciati da acquisire; nessuna interpretazione legale |
| Mutui | Più pratiche/offerte, stadi, TAN/TAEG, rata stimata e comunicata | Nessuna connessione bancaria, simulazione francese sul TAN senza simulazione andamento tasso variabile |
| Finanze | Tre scenari, riserva, fabbisogno, movimenti, saldo datato e differenza previsto/effettivo | Ipotesi e registro non si sincronizzano automaticamente; nessuna disponibilità intragiornaliera presunta |
| Contatti e diario | Persone, organizzazioni, ruoli, ultime/prossime azioni, comunicazioni e decisioni | Inserimento e allegati manuali; nessuna sincronizzazione mail/messaggistica |
| Lavori | Fornitori, preventivi multipli, scelta motivata, costi/date e garanzie | Dipendenze via attività collegate; pagamenti/fatture tramite movimenti e documenti |
| Checklist rogito | Requisiti necessari, professionali/facoltativi, prove e dipendenze | Indicatore solo organizzativo, mai certificazione |
| Report | PDF per area, CSV, JSON, archivio e backup | Esportazioni globali di tutte le operazioni, senza invio automatico |
| Ripristino (0.2.0) | ZIP dall’interfaccia, verifica, anteprima, conferma e copia precedente recuperabile | Sostituzione completa, senza merge; massimo 512 MB compressi; copie precedenti da scaricare separatamente |
| Distribuzione | Dockerfile, Compose, health check, add-on HA OS con Ingress | Installazione sul dispositivo HA e verifica Ingress reale non eseguite automaticamente |
| Protezione | Accesso HA o password familiare, CSRF, audit e controllo revisioni | Nessun account familiare individuale/RBAC né cifratura dei dati a riposo |

## Verifica operativa dopo installazione HA

Aprire Ingress, registrare e modificare un’attività di prova, caricare un file di prova, riavviare l’add-on e verificare persistenza. Scaricare un backup e provarne il ripristino dall’interfaccia in un’installazione di collaudo distinta; verificare anche lo scaricamento della copia precedente. Controllare da smartphone la navigazione e l’apertura delle anteprime. Eliminare poi i soli dati di prova tramite le conferme previste.

Non sono stati installati o modificati add-on esistenti. Nessun contatto, banca, notaio o controparte ha ricevuto comunicazioni dall’app o dallo sviluppo.
