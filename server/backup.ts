import yauzl from "yauzl";
import { createHash, randomUUID } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { Database } from "./database.js";

export async function restoreArchive(archivePath: string, targetDir: string) {
  const target = resolve(targetDir);
  if (existsSync(target) && readdirSync(target).length > 0)
    throw new Error(
      "Il ripristino richiede una cartella nuova o vuota. Arrestare prima l’app e conservare i dati esistenti.",
    );
  mkdirSync(dirname(target), { recursive: true });
  const staging = resolve(dirname(target), `.casa-restore-${randomUUID()}`);
  mkdirSync(staging, { mode: 0o700 });
  try {
    const archive = await new Promise<yauzl.ZipFile>((res, rej) =>
      yauzl.open(
        resolve(archivePath),
        { lazyEntries: true, autoClose: true },
        (err, zip) => (err ? rej(err) : res(zip!)),
      ),
    );
    let total = 0;
    let count = 0;
    const seen = new Set<string>();
    await new Promise<void>((res, rej) => {
      archive.on("error", rej);
      archive.on("end", res);
      archive.on("entry", (entry: yauzl.Entry) => {
        void (async () => {
          const name = entry.fileName;
          if (name === "documents/") {
            archive.readEntry();
            return;
          }
          if (
            !/^(manifest\.json|export\.json|casa\.sqlite|documents\/[a-f0-9]{64})$/.test(
              name,
            ) ||
            seen.has(name)
          )
            throw new Error("Percorso ZIP non consentito o duplicato");
          seen.add(name);
          total += entry.uncompressedSize;
          count++;
          if (
            total > 2 * 1024 * 1024 * 1024 ||
            count > 10000 ||
            entry.uncompressedSize > 256 * 1024 * 1024
          )
            throw new Error(
              "Backup troppo grande: limite 2 GB, 10.000 file e 256 MB per elemento",
            );
          const output = resolve(staging, name);
          mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
          const stream = await new Promise<NodeJS.ReadableStream>(
            (resolveStream, rejectStream) =>
              archive.openReadStream(entry, (error, input) =>
                error ? rejectStream(error) : resolveStream(input!),
              ),
          );
          await pipeline(
            stream,
            createWriteStream(output, { flags: "wx", mode: 0o600 }),
          );
          archive.readEntry();
        })().catch((error) => {
          archive.close();
          rej(error);
        });
      });
      archive.readEntry();
    });
    const manifest = z
      .object({
        format: z.literal("casa-manager-backup"),
        version: z.literal(1),
        files: z.array(
          z.object({
            hash: z.string().regex(/^[a-f0-9]{64}$/),
            versionId: z.uuid(),
            documentId: z.uuid(),
            filename: z.string(),
          }),
        ),
      })
      .parse(
        JSON.parse(readFileSync(resolve(staging, "manifest.json"), "utf8")),
      );
    if (!seen.has("casa.sqlite") || !seen.has("export.json"))
      throw new Error("Backup incompleto");
    const restored = new Database(staging);
    try {
      if (
        restored.sql.prepare("PRAGMA integrity_check").get()
          ?.integrity_check !== "ok" ||
        restored.sql.prepare("PRAGMA foreign_key_check").all().length
      )
        throw new Error("Database non integro");
      const versions = restored.list("document_versions");
      if (manifest.files.length !== versions.length)
        throw new Error("Manifest e database non corrispondono");
      for (const version of versions) {
        const entry = manifest.files.find(
          (f) =>
            f.versionId === version.id &&
            f.hash === version.hash &&
            f.documentId === version.document_id,
        );
        const path = resolve(staging, "documents", String(version.hash));
        if (
          !entry ||
          !existsSync(path) ||
          createHash("sha256").update(readFileSync(path)).digest("hex") !==
            version.hash
        )
          throw new Error(`File mancante o alterato: ${version.filename}`);
      }
    } finally {
      restored.close();
    }
    if (existsSync(target)) rmdirSync(target); // Only an empty directory is ever removed.
    renameSync(staging, target);
    return { target, files: manifest.files.length };
  } catch (error) {
    // staging is a unique, fixed child of the target's parent, never a user-derived recursive deletion target.
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
