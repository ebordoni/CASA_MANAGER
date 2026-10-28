import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { entities, type Row, type Scalar } from "../shared/model.js";
import { StorageCatalog } from "./storage.js";
import type { BackupCounts } from "../shared/backup.js";

export class Database {
  private depth = 0;
  sql: DatabaseSync;
  dataDir: string;
  readonly rootDir: string;
  private readonly storage?: StorageCatalog;
  private closed = false;
  constructor(dataDir: string, options: { followActive?: boolean } = {}) {
    this.rootDir = resolve(dataDir);
    if (options.followActive !== false)
      this.storage = new StorageCatalog(this.rootDir);
    this.dataDir = this.storage?.currentPath ?? this.rootDir;
    if (
      this.storage &&
      this.storage.generation !== "legacy" &&
      !existsSync(resolve(this.dataDir, "casa.sqlite"))
    )
      throw new Error(
        "Dataset attivo assente: ripristinare una copia dei dati, senza inizializzare un nuovo database.",
      );
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    mkdirSync(resolve(this.dataDir, "documents"), {
      recursive: true,
      mode: 0o700,
    });
    this.sql = new DatabaseSync(resolve(this.dataDir, "casa.sqlite"));
    this.sql.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    const current =
      this.sql.prepare("SELECT MAX(version) AS version FROM migrations").get()
        ?.version ?? 0;
    if (Number(current) > 2) {
      this.sql.close();
      throw new Error(
        "Schema database più recente dell’app: usare una versione compatibile o ripristinare il backup precedente.",
      );
    }
    if (Number(current) < 1)
      this.atomic(() => {
        this.sql.exec(
          readFileSync(
            new URL("../migrations/001_initial.sql", import.meta.url),
            "utf8",
          ),
        );
        this.sql
          .prepare("INSERT INTO migrations VALUES(?,?)")
          .run(1, new Date().toISOString());
      });
    if (Number(current) < 2)
      this.atomic(() => {
        this.sql.exec(
          readFileSync(
            new URL("../migrations/002_actual_amount.sql", import.meta.url),
            "utf8",
          ),
        );
        this.sql
          .prepare("INSERT INTO migrations VALUES(?,?)")
          .run(2, new Date().toISOString());
      });
    if (this.sql.prepare("PRAGMA foreign_key_check").all().length) {
      this.sql.close();
      throw new Error(
        "Database con riferimenti non validi: ripristinare un backup verificato.",
      );
    }
  }
  atomic<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.sql.exec("BEGIN IMMEDIATE");
    this.depth++;
    try {
      const result = fn();
      this.sql.exec("COMMIT");
      return result;
    } catch (error) {
      this.sql.exec("ROLLBACK");
      throw error;
    } finally {
      this.depth--;
    }
  }
  table(entity: string) {
    if (
      !entities[entity] &&
      !["document_versions", "audit_events"].includes(entity)
    )
      throw new Error("Entità sconosciuta");
    return `"${entity}"`;
  }
  list(entity: string): Row[] {
    return this.sql
      .prepare(
        `SELECT * FROM ${this.table(entity)} ORDER BY created_at DESC, id`,
      )
      .all() as Row[];
  }
  get(entity: string, id: string): Row | undefined {
    return this.sql
      .prepare(`SELECT * FROM ${this.table(entity)} WHERE id=?`)
      .get(id) as Row | undefined;
  }
  insert(entity: string, data: Record<string, Scalar>, actor = "family"): Row {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      revision: 1,
      created_at: now,
      updated_at: now,
      ...data,
    };
    const keys = Object.keys(row);
    this.sql
      .prepare(
        `INSERT INTO ${this.table(entity)} (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      )
      .run(...Object.values(row));
    this.audit(entity, row.id, "create", null, row, actor);
    return row as Row;
  }
  update(
    entity: string,
    id: string,
    data: Record<string, Scalar>,
    revision: number,
    actor = "family",
  ): Row {
    const before = this.get(entity, id);
    if (!before) throw new AppError(404, "Elemento non trovato");
    if (before.revision !== revision)
      throw new AppError(
        409,
        "Questo elemento è stato modificato. Ricarica prima di salvare.",
      );
    const values = {
      ...data,
      revision: revision + 1,
      updated_at: new Date().toISOString(),
    };
    this.sql
      .prepare(
        `UPDATE ${this.table(entity)} SET ${Object.keys(values)
          .map((k) => `"${k}"=?`)
          .join(",")} WHERE id=? AND revision=?`,
      )
      .run(...Object.values(values), id, revision);
    const row = this.get(entity, id)!;
    this.audit(entity, id, "update", before, row, actor);
    return row;
  }
  remove(entity: string, id: string, revision: number, actor = "family") {
    const before = this.get(entity, id);
    if (!before) throw new AppError(404, "Elemento non trovato");
    if (before.revision !== revision)
      throw new AppError(
        409,
        "Elemento modificato: ricarica prima di eliminare",
      );
    this.sql.prepare(`DELETE FROM ${this.table(entity)} WHERE id=?`).run(id);
    this.audit(entity, id, "delete", before, null, actor);
  }
  audit(
    entity: string,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
    actor: string,
  ) {
    this.sql
      .prepare(
        "INSERT INTO audit_events(id,entity,entity_id,action,before_json,after_json,actor,created_at,updated_at,revision) VALUES(?,?,?,?,?,?,?,?,?,1)",
      )
      .run(
        randomUUID(),
        entity,
        id,
        action,
        JSON.stringify(before),
        JSON.stringify(after),
        actor,
        new Date().toISOString(),
        new Date().toISOString(),
      );
  }
  snapshot() {
    return Object.fromEntries(
      [...Object.keys(entities), "document_versions", "audit_events"].map(
        (key) => [key, this.list(key)],
      ),
    );
  }
  get generation() {
    return this.storage?.generation ?? "legacy";
  }
  changeToken() {
    const last =
      this.sql
        .prepare("SELECT id FROM audit_events ORDER BY rowid DESC LIMIT 1")
        .get()?.id ?? "";
    const count =
      this.sql.prepare("SELECT COUNT(*) AS count FROM audit_events").get()
        ?.count ?? 0;
    const externalVersion =
      this.sql.prepare("PRAGMA data_version").get()?.data_version ?? 0;
    return createHash("sha256")
      .update(`${this.generation}:${last}:${count}:${externalVersion}`)
      .digest("hex");
  }
  activateDataset(
    id: string,
    previous: { operations: string[]; counts: BackupCounts },
  ) {
    if (!this.storage || this.depth > 0)
      throw new Error("Impossibile cambiare dataset durante una transazione");
    const candidate = new Database(this.storage.datasetPath(id), {
      followActive: false,
    });
    try {
      // The catalog atomically records the restore history alongside the active pointer.
      // Keep the imported audit exactly as it was in the backup.
      const recoveryPoint = this.storage.activate(id, previous);
      const old = this.sql;
      this.sql = candidate.sql;
      this.dataDir = candidate.dataDir;
      // The durable pointer is already committed. Failure to release an old handle must not undo the reported activation.
      try {
        old.close();
      } catch {
        /* The obsolete handle will be released by SQLite's finalizer. */
      }
      return recoveryPoint;
    } catch (error) {
      if (this.sql !== candidate.sql) candidate.close();
      throw error;
    }
  }
  recoveryPoints() {
    return this.storage?.recoveryPoints() ?? [];
  }
  recoveryPath(id: string) {
    return this.storage?.recoveryPath(id) ?? null;
  }
  close() {
    if (!this.closed) {
      this.sql.close();
      this.closed = true;
    }
  }
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
