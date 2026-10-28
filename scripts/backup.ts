import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Database } from "../server/database.js";
import { createArchive } from "../server/reports.js";
const dataDir = resolve(process.env.DATA_DIR ?? "./data");
if (!existsSync(resolve(dataDir, "casa.sqlite")))
  throw new Error("Database non trovato: nessun backup creato");
mkdirSync("backups", { recursive: true, mode: 0o700 });
const destination = resolve(
  "backups",
  `home-manager-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`,
);
const db = new Database(dataDir);
try {
  const archive = createArchive(db);
  const complete = pipeline(
    archive,
    createWriteStream(destination, { flags: "wx", mode: 0o600 }),
  );
  await archive.finalize();
  await complete;
  console.log(`Backup creato: ${destination}`);
} finally {
  db.close();
}
