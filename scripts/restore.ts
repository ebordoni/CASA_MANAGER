import { parseArgs } from "node:util";
import { restoreArchive } from "../server/backup.js";
const { values } = parseArgs({
  options: { from: { type: "string" }, into: { type: "string" } },
});
if (!values.from || !values.into)
  throw new Error(
    "Uso: npm run restore -- --from backup.zip --into ./data-ripristinati (cartella nuova/vuota; app arrestata)",
  );
const result = await restoreArchive(values.from, values.into);
console.log(
  `Ripristino verificato: ${result.target}, ${result.files} file. Impostare DATA_DIR e avviare l’app.`,
);
