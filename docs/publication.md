# Pubblicazione del repository

La configurazione `initial-data.json` crea soltanto un’operazione vuota, gli stati delle transazioni e un’impostazione di promemoria. Le fixture in `test/fixtures` contengono dati sintetici e sono escluse dall’immagine Docker. I dati salvati dalle installazioni esistenti restano nella cartella persistente e non vengono modificati dal cambio dei sorgenti.

Prima di un push eseguire:

```sh
npm run check:public
npm test
npm run build
git diff --check
```

Il controllo automatico segnala database, archivi, file di ambiente, chiavi, alcuni formati di token, email non dimostrative e percorsi utente. Non sostituisce la revisione manuale di testi, immagini e cronologia. Un file già tracciato rimane pubblicabile anche se successivamente aggiunto a `.gitignore`: va rimosso anche dall’indice e, quando necessario, dalla cronologia.

Non commettere dati applicativi, backup, esportazioni, schermate con dati reali, log o configurazioni locali. Per un’importazione privata usare `INITIAL_DATA_FILE` con un percorso esterno al repository, poi modificare i dati dall’interfaccia.

## Cronologia e GitHub

Se una versione precedente conteneva dati personali, un commit di rimozione non elimina le versioni storiche. Usare una cronologia pulita per tutti i rami e tag destinati al pubblico; conservare eventuali copie di sicurezza fuori dal progetto. I nuovi commit devono usare un’identità pubblica scelta dal manutentore o un’identità di progetto, senza email personali o aziendali non destinate alla pubblicazione.

Dopo una riscrittura, gli altri cloni devono essere ricreati o riallineati senza unire nuovamente la vecchia cronologia. Non pubblicare copie private, bundle o ref di backup.

GitHub può conservare vecchi oggetti, viste in cache e riferimenti di pull request anche dopo un push della cronologia riscritta. Prima di rendere pubblico un repository che ha contenuto dati sensibili, verificare anche fork, pull request, workflow, artefatti, release e oggetti LFS e seguire la procedura GitHub per richiedere la rimozione delle copie residue. La sola riscrittura non certifica una cancellazione completa lato piattaforma.

Riferimento: [rimozione di dati sensibili da un repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## Licenze

Le licenze delle dipendenze restano applicabili; quella di Noto Sans è inclusa in `public/licenses`. La visibilità pubblica non sceglie automaticamente una licenza per il codice del progetto: il titolare deve sceglierla separatamente se desidera concedere il riuso.
