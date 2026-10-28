import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { entities, schemaFor, type Row } from "../shared/model.js";
import {
  MAX_BACKUP_BYTES,
  type BackupCounts,
  type RestorePreview,
  type RestoreResult,
} from "../shared/backup.js";
import { AppError, Database } from "./database.js";
import { restoreArchive } from "./backup.js";
import { atomicJson } from "./storage.js";
import { createArchive } from "./reports.js";
import { Service } from "./service.js";

const PREVIEW_LIFETIME_MS = 60 * 60 * 1000;
const previewSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  backupDate: z.string().nullable(),
  expiresAt: z.iso.datetime(),
  operations: z.array(z.string()),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  currentCounts: z.record(z.string(), z.number().int().nonnegative()),
  files: z.number().int().nonnegative(),
  expectedState: z.string(),
});

function counts(db: Database): BackupCounts {
  return Object.fromEntries(
    [...Object.keys(entities), "document_versions", "audit_events"].map(
      (table) => [
        table,
        Number(
          db.sql
            .prepare(`SELECT COUNT(*) AS count FROM ${db.table(table)}`)
            .get()!.count,
        ),
      ],
    ),
  );
}

export class RestoreManager {
  private preparing = false;
  private readonly stageRoot: string;
  constructor(private readonly db: Database) {
    this.stageRoot = resolve(db.rootDir, "restore-staging");
    mkdirSync(this.stageRoot, { recursive: true, mode: 0o700 });
  }
  private stage(id: string) {
    z.uuid().parse(id);
    return resolve(this.stageRoot, id);
  }
  private removeStage(id: string) {
    const path = this.stage(id);
    if (dirname(path) !== this.stageRoot)
      throw new Error("Percorso temporaneo non valido");
    rmSync(path, { recursive: true, force: true });
  }
  private cleanupExpired() {
    for (const id of readdirSync(this.stageRoot).filter(
      (name) => z.uuid().safeParse(name).success,
    )) {
      const path = this.stage(id);
      let expired = Date.now() - statSync(path).mtimeMs > PREVIEW_LIFETIME_MS;
      const meta = resolve(path, "preview.json");
      if (existsSync(meta)) {
        try {
          expired =
            Date.parse(
              previewSchema.parse(JSON.parse(readFileSync(meta, "utf8")))
                .expiresAt,
            ) <= Date.now();
        } catch {
          expired = true;
        }
      }
      if (expired) this.removeStage(id);
    }
  }
  private validateDataset(path: string) {
    const candidate = new Database(path, { followActive: false });
    try {
      if (
        candidate.sql
          .prepare(
            "SELECT name FROM sqlite_master WHERE type IN ('trigger','view') OR sql LIKE 'CREATE VIRTUAL TABLE%'",
          )
          .all().length
      )
        throw new Error("Il backup contiene oggetti SQLite non supportati");
      const totals = counts(candidate);
      if (Object.values(totals).reduce((sum, n) => sum + n, 0) > 100000)
        throw new Error("Il backup supera il limite di 100.000 record");
      if (!totals.operations)
        throw new Error("Il backup non contiene alcuna operazione immobiliare");
      const data = candidate.snapshot();
      for (const [entity, definition] of Object.entries(entities))
        for (const row of data[entity]) {
          z.uuid().parse(row.id);
          schemaFor(entity).parse(
            Object.fromEntries(
              Object.keys(definition.fields).map((field) => [
                field,
                row[field] ?? null,
              ]),
            ),
          );
        }
      for (const version of data.document_versions) {
        z.object({
          id: z.uuid(),
          document_id: z.uuid(),
          hash: z.string().regex(/^[a-f0-9]{64}$/),
          size: z
            .number()
            .int()
            .positive()
            .max(25 * 1024 * 1024),
          mime: z.enum([
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
            "text/plain",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.oasis.opendocument.text",
          ]),
        }).parse(version);
        const bytes = readFileSync(
          resolve(path, "documents", String(version.hash)),
        );
        if (
          bytes.length !== version.size ||
          createHash("sha256").update(bytes).digest("hex") !== version.hash
        )
          throw new Error(
            "Integrità del documento non corrispondente al backup",
          );
      }
      for (const event of data.audit_events) {
        JSON.parse(String(event.before_json));
        JSON.parse(String(event.after_json));
      }
      new Service(candidate).dashboard();
      return {
        counts: totals,
        operations: data.operations.map((row: Row) => String(row.title)),
        files: data.document_versions.length,
      };
    } finally {
      candidate.close();
    }
  }
  async prepare(
    stream: Readable,
    filename: string,
    isTruncated: () => boolean = () => false,
  ): Promise<RestorePreview> {
    if (this.preparing)
      throw new AppError(409, "È già in corso la verifica di un backup");
    if (!filename.toLowerCase().endsWith(".zip"))
      throw new AppError(
        422,
        "Selezionare il file ZIP del backup completo di home manager",
      );
    this.cleanupExpired();
    if (readdirSync(this.stageRoot).length >= 3)
      throw new AppError(
        409,
        "Sono già presenti tre backup da confermare: annullarne uno prima di caricarne altri",
      );
    this.preparing = true;
    const id = randomUUID();
    const path = this.stage(id);
    const archive = resolve(path, "upload.zip");
    try {
      mkdirSync(path, { mode: 0o700 });
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BACKUP_BYTES)
          stream.destroy(
            new AppError(413, "Il backup supera il limite di 512 MB"),
          );
      });
      await pipeline(
        stream,
        createWriteStream(archive, { flags: "wx", mode: 0o600 }),
      );
      if (isTruncated() || size > MAX_BACKUP_BYTES)
        throw new AppError(413, "Il backup supera il limite di 512 MB");
      const dataset = resolve(path, "dataset");
      await restoreArchive(archive, dataset);
      const summary = this.validateDataset(dataset);
      const manifest = JSON.parse(
        readFileSync(resolve(dataset, "manifest.json"), "utf8"),
      ) as { createdAt?: unknown };
      const backupDate = z.iso.datetime().safeParse(manifest.createdAt);
      const preview: RestorePreview = {
        id,
        filename: basename(filename.replaceAll("\\", "/")).slice(0, 200),
        backupDate: backupDate.success ? backupDate.data : null,
        expiresAt: new Date(Date.now() + PREVIEW_LIFETIME_MS).toISOString(),
        ...summary,
        currentCounts: counts(this.db),
        expectedState: this.db.changeToken(),
      };
      atomicJson(resolve(path, "preview.json"), preview);
      unlinkSync(archive);
      return preview;
    } catch (error) {
      this.removeStage(id);
      const err = error as Error & { code?: string };
      if (err.code === "FST_REQ_FILE_TOO_LARGE")
        throw new AppError(413, "Il backup supera il limite di 512 MB");
      if (err.code === "ENOSPC")
        throw new AppError(
          507,
          "Spazio su disco insufficiente per verificare il backup",
        );
      if (error instanceof AppError) throw error;
      throw new AppError(
        422,
        `Backup non valido: ${error instanceof z.ZodError ? "dati non compatibili con questa versione dell’app" : err.message}`,
      );
    } finally {
      this.preparing = false;
    }
  }
  preview(id: string): RestorePreview {
    const path = resolve(this.stage(id), "preview.json");
    if (!existsSync(path))
      throw new AppError(404, "Backup da confermare non trovato");
    const preview = previewSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    if (preview.id !== id)
      throw new AppError(422, "Identificativo del backup non valido");
    if (Date.parse(preview.expiresAt) <= Date.now()) {
      this.removeStage(id);
      throw new AppError(
        410,
        "La verifica è scaduta: caricare di nuovo il backup",
      );
    }
    return preview;
  }
  commit(
    id: string,
    expectedState: string,
    confirmation: string,
  ): RestoreResult {
    if (confirmation !== "RIPRISTINA")
      throw new AppError(
        422,
        "Digitare RIPRISTINA per confermare la sostituzione dei dati",
      );
    if (this.preparing)
      throw new AppError(409, "Attendere il termine della verifica in corso");
    const preview = this.preview(id);
    if (
      preview.expectedState !== expectedState ||
      this.db.changeToken() !== expectedState
    )
      throw new AppError(
        409,
        "I dati attuali sono cambiati dopo la verifica. Annullare e verificare nuovamente il backup.",
      );
    const source = resolve(this.stage(id), "dataset");
    this.validateDataset(source);
    const generation = randomUUID();
    const destination = resolve(this.db.rootDir, "datasets", generation);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    renameSync(source, destination);
    try {
      const recovery = this.db.activateDataset(generation, {
        operations: this.db.list("operations").map((row) => String(row.title)),
        counts: counts(this.db),
      });
      // Activation is durable now; temporary-file cleanup must not report a failed restore after success.
      try {
        this.removeStage(id);
      } catch {
        /* Expired-stage cleanup can retry housekeeping later. */
      }
      return { generation, recoveryPointId: recovery.id };
    } catch (error) {
      // If the pointer was not committed, the original database stays open and untouched.
      if (this.db.generation !== generation) renameSync(destination, source);
      throw error;
    }
  }
  cancel(id: string) {
    // Idempotent: an expired preview must not trap the user in the confirmation dialog.
    if (existsSync(this.stage(id))) this.removeStage(id);
  }
  recoveryPoints() {
    return this.db.recoveryPoints();
  }
  recoveryArchive(id: string) {
    const path = this.db.recoveryPath(id);
    if (!path) throw new AppError(404, "Copia precedente non trovata");
    const previous = new Database(path, { followActive: false });
    try {
      return createArchive(previous);
    } finally {
      previous.close();
    }
  }
}
