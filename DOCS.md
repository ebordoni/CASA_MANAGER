# Installazione e gestione in Home Assistant

home manager è un add-on locale per Home Assistant OS. Su installazioni Supervised che dispongono del Supervisor può usare lo stesso meccanismo; il packaging principale è per OS. Home Assistant Container richiede invece il servizio Docker autonomo descritto nel README.

1. Copiare il progetto in `/addons/casa_manager`, senza dati privati di sviluppo, dipendenze o build locali.
2. Ricaricare lo store add-on e installare la voce locale home manager.
3. Avviare e aprire l’interfaccia tramite Ingress; opzionalmente attivare la visualizzazione nel pannello laterale.
4. Controllare i dati iniziali in Operazione, Vendita, Acquisto e Finanze. Inserire importi esatti e date soltanto quando disponibili.
5. Caricare i documenti dalle rispettive schede; verificare manualmente ciascun file prima di cambiarne lo stato in Verificato.

## Configurazione

L’unica opzione Supervisor è `log_level`: `debug`, `info` (predefinito), `warn`, `error`, `fatal`. L’app legge `/data/options.json` all’avvio. Non richiede password HA o token Supervisor. L’accesso è protetto dall’Ingress e limitato all’amministratore nel pannello.

Non aprire la porta 8104 sul router o tramite `ports` nell’add-on. Per un servizio autonomo l’app richiede `APP_PASSWORD` quando ascolta in rete. Il database e tutti gli allegati risiedono in `/data`, mai tra gli asset pubblici.

## Backup e aggiornamenti

Dalla versione **0.2.0** si può ripristinare il ZIP applicativo direttamente da Ingress:

1. Aprire **Impostazioni → Backup e ripristino → Carica backup**.
2. Selezionare il ZIP del **Backup completo** di home manager, massimo 512 MB, senza estrarlo. Non è un archivio generico né un backup Supervisor.
3. Premere **Verifica backup**: vengono controllati database, riferimenti, dati e hash dei documenti, senza cambiare l’operazione attiva.
4. Controllare il riepilogo, digitare **RIPRISTINA** e premere **Ripristina dati**.
5. Le operazioni del backup sono subito disponibili, senza riavviare l’add-on. Ricaricare eventuali altre finestre.

I dati presenti prima dell’importazione sono conservati in una copia precedente scaricabile nella stessa pagina. Per annullare un ripristino, scaricare quella copia e importarla con la stessa procedura. Le opzioni Supervisor, `options.json` e la sessione non vengono importati dal backup né cancellati. Non servono SSH o nuovi privilegi.

Sono compatibili i backup completi della versione 0.1.0. La verifica scade dopo un’ora; se i dati cambiano prima della conferma, occorre annullare e caricare nuovamente il file. Un archivio non valido non sostituisce i dati attuali. Le copie precedenti occupano spazio e vengono incluse nei backup Supervisor; il ZIP applicativo contiene soltanto i dati attivi. I limiti di decompressione sono 2 GB, 10.000 file e 100.000 record.

Scaricare un backup completo dall’app e includere l’add-on nei backup di Home Assistant. Il backup Supervisor usa la modalità `cold`: l’add-on viene arrestato durante la copia. Il ZIP applicativo è coerente anche durante l’utilizzo e verifica gli hash prima dell’esportazione.

Per aggiornare un’installazione locale, sostituire i sorgenti, mantenere `/data` e ricostruire l’add-on. Non utilizzare file SQLite di una versione futura con codice più vecchio: per tornare indietro ripristinare anche il backup compatibile.

Dopo il primo ripristino, i dati attivi sono in `/data/datasets/<id>` e selezionati da `/data/active-dataset.json`. Conservare l’intera cartella `/data`, senza spostare singoli database o cancellare il catalogo. Non tornare alla versione 0.1.0 su questo stesso volume: quella versione non riconosce il catalogo dei dataset e aprirebbe i dati precedenti. Per un downgrade, ripristinare separatamente un backup compatibile.

## Risoluzione dei problemi

- **Interfaccia non raggiungibile direttamente sulla porta 8104:** comportamento previsto, aprire l’Ingress.
- **403:** richiesta esterna al proxy Ingress o origine non valida. Non disabilitare la protezione per risolvere: verificare che si stia aprendo l’add-on dal pannello HA.
- **Documento non verificabile:** deve esistere almeno un file caricato. Nuove versioni riportano il documento e le verifiche collegate allo stato Da verificare.
- **Salvataggio in conflitto:** l’elemento è cambiato da un’altra finestra oppure serve la conferma esplicita della transizione. Ricaricare o leggere il messaggio nel modulo.
- **Obbligo non chiudibile:** acquisire e verificare la prova richiesta.
- **Saldi finanziari vuoti:** inserire in Operazione un saldo esatto, confermato e datato. Le ipotesi degli scenari non diventano automaticamente liquidità disponibile.
- **Backup non esportabile:** uno dei file referenziati è assente o non corrisponde all’hash. Controllare i log e ripristinare una copia integra; non confermare documenti corrotti.

Versione iniziale: l’installazione e l’Ingress sul dispositivo reale richiedono la verifica sul proprio Home Assistant. Non sono richiesti servizi cloud. La distribuzione tramite repository remoto e l’eventuale canale di assistenza vanno configurati e verificati separatamente.

## Aggiornamento dal nome precedente

Dalla versione 0.3.0 il nome visibile è **home manager**. Per aggiornare un add-on esistente conservare cartella di installazione, slug e `/data`; non installare una seconda copia soltanto per cambiare nome. Il ripristino riconosce i backup delle versioni precedenti. Le nuove installazioni partono da una configurazione neutra, senza dati familiari.
