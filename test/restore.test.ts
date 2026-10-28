import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { request as httpRequest } from "node:http";
import { randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { buildApp } from "../server/app.js";
import { Database } from "../server/database.js";
import { Service } from "../server/service.js";
import { DocumentService } from "../server/documents.js";
import { createArchive } from "../server/reports.js";
import { restoreArchive } from "../server/backup.js";
import type {
  RestorePreview,
  RestoreResult,
  RecoveryPoint,
} from "../shared/backup.js";

function populate(path: string, title: string, withDocument = false) {
  const db = new Database(path);
  const service = new Service(db);
  const operation = service.save("operations", { title, currency: "EUR" });
  service.save("people", { title: `Contatto · ${title}` });
  if (withDocument) {
    const doc = service.save("documents", {
      title: "Documento di prova",
      operation_id: operation.id,
      category: "Prove",
    });
    new DocumentService(db).upload(
      doc.id,
      "prova.txt",
      Buffer.from(`Contenuto · ${title}`),
      doc.revision,
    );
  }
  return db;
}
async function archive(db: Database, path: string) {
  const stream = createArchive(db);
  const finished = pipeline(stream, createWriteStream(path));
  await stream.finalize();
  await finished;
  return readFileSync(path);
}
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = mkdtempSync(join(tmpdir(), "home-manager-restore-test-"));
  const currentPath = join(root, "current");
  populate(currentPath, "Operazione attuale", true).close();
  writeFileSync(
    join(currentPath, "options.json"),
    JSON.stringify({ log_level: "info" }),
  );
  const context = await buildApp({ dataDir: currentPath });
  const source = populate(join(root, "source"), "Operazione nel backup", true);
  const zip = await archive(source, join(root, "backup.zip"));
  source.close();
  t.after(async () => {
    await context.app.close();
    rmSync(root, { recursive: true, force: true });
  });
  const upload = async (bytes: Buffer = zip, name = "backup-casa.zip") => {
    const boundary = "home-manager-restore-test";
    return context.app.inject({
      method: "POST",
      url: "/api/restores/preview",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/zip\r\n\r\n`,
        ),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });
  };
  const confirm = async (
    preview: RestorePreview,
    confirmation = "RIPRISTINA",
  ) =>
    context.app.inject({
      method: "POST",
      url: `/api/restores/${preview.id}/confirm`,
      payload: { expectedState: preview.expectedState, confirmation },
    });
  return { ...context, root, currentPath, zip, upload, confirm };
}

test("verifica e annullamento del backup non modificano i dati attivi", async (t) => {
  const f = await fixture(t);
  const before = f.db.snapshot();
  const response = await f.upload();
  assert.equal(response.statusCode, 200, response.body);
  const preview = response.json<RestorePreview>();
  assert.deepEqual(preview.operations, ["Operazione nel backup"]);
  assert.equal(preview.files, 1);
  assert.equal(preview.counts.document_versions, 1);
  assert.equal(preview.currentCounts.documents, 1);
  assert.deepEqual(f.db.snapshot(), before);
  assert.equal(f.db.generation, "legacy");
  assert.equal(
    (
      await f.app.inject({
        method: "DELETE",
        url: `/api/restores/${preview.id}`,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "DELETE",
        url: `/api/restores/${preview.id}`,
      })
    ).statusCode,
    200,
  );
  assert.equal((await f.confirm(preview)).statusCode, 404);
  assert.deepEqual(f.db.snapshot(), before);
});

test("ripristino attiva database e documenti, mantiene opzioni/sessione e conserva la copia precedente", async (t) => {
  const f = await fixture(t);
  const key = readFileSync(join(f.currentPath, "session.key"));
  const preview = (await f.upload()).json<RestorePreview>();
  assert.equal((await f.confirm(preview, "CONFERMO")).statusCode, 422);
  assert.equal(f.db.generation, "legacy");
  const applied = await f.confirm(preview);
  assert.equal(applied.statusCode, 200, applied.body);
  const result = applied.json<RestoreResult>();
  assert.notEqual(result.generation, "legacy");
  assert.equal(f.db.generation, result.generation);
  assert.equal(f.db.list("operations")[0].title, "Operazione nel backup");
  assert.deepEqual(readFileSync(join(f.currentPath, "session.key")), key);
  assert.equal(
    JSON.parse(readFileSync(join(f.currentPath, "options.json"), "utf8"))
      .log_level,
    "info",
  );
  const version = f.db.list("document_versions")[0];
  assert.equal(
    f.docs.read(version.id).buffer.toString(),
    "Contenuto · Operazione nel backup",
  );
  const legacy = new Database(f.currentPath, { followActive: false });
  try {
    assert.equal(legacy.list("operations")[0].title, "Operazione attuale");
  } finally {
    legacy.close();
  }
  assert.equal((await f.confirm(preview)).statusCode, 404);
  const history = (await f.app.inject("/api/restores")).json<{
    recoveryPoints: RecoveryPoint[];
  }>().recoveryPoints;
  assert.equal(history.length, 1);
  assert.equal(history[0].id, result.recoveryPointId);
  assert.deepEqual(history[0].operations, ["Operazione attuale"]);
  assert.equal("dataset" in history[0], false);
  const downloaded = await f.app.inject(
    `/api/restores/recovery/${result.recoveryPointId}/backup`,
  );
  assert.equal(downloaded.statusCode, 200);
  const previousZip = join(f.root, "previous.zip");
  writeFileSync(previousZip, downloaded.rawPayload);
  const recovered = join(f.root, "previous");
  await restoreArchive(previousZip, recovered);
  const previous = new Database(recovered);
  try {
    assert.equal(previous.list("operations")[0].title, "Operazione attuale");
  } finally {
    previous.close();
  }
});

test("riavvio e backup CLI seguono il dataset attivo senza reimportare il seed", async (t) => {
  const f = await fixture(t);
  const result = (
    await f.confirm((await f.upload()).json<RestorePreview>())
  ).json<RestoreResult>();
  await f.app.close();
  const reopened = await buildApp({ dataDir: f.currentPath });
  try {
    assert.equal(reopened.db.generation, result.generation);
    assert.equal(reopened.db.list("operations").length, 1);
    assert.equal(
      reopened.db.list("operations")[0].title,
      "Operazione nel backup",
    );
    assert.ok(reopened.db.recoveryPoints().length === 1);
    const backupDb = new Database(f.currentPath);
    try {
      assert.equal(
        backupDb.list("operations")[0].title,
        "Operazione nel backup",
      );
    } finally {
      backupDb.close();
    }
  } finally {
    await reopened.app.close();
  }
});

test("finestre obsolete non possono scrivere sul nuovo dataset", async (t) => {
  const f = await fixture(t);
  const result = (
    await f.confirm((await f.upload()).json<RestorePreview>())
  ).json<RestoreResult>();
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: "/api/entities/people",
        payload: { title: "Vecchio client" },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: "/api/entities/people",
        headers: { "x-casa-generation": "legacy" },
        payload: { title: "Vecchia generazione" },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: "/api/entities/people",
        headers: { "x-casa-generation": result.generation },
        payload: { title: "Client aggiornato" },
      })
    ).statusCode,
    201,
  );
  const bootstrap = (await f.app.inject("/api/bootstrap")).json();
  assert.equal(bootstrap.generation, result.generation);
});

test("modifiche dopo l’anteprima richiedono una nuova verifica", async (t) => {
  const f = await fixture(t);
  const preview = (await f.upload()).json<RestorePreview>();
  f.service.save("people", {
    title: "Nuovo contatto successivo alla verifica",
  });
  const result = await f.confirm(preview);
  assert.equal(result.statusCode, 409);
  assert.match(result.body, /cambiati/);
  assert.equal(f.db.generation, "legacy");
  assert.equal(f.db.list("people").length, 2);
});

test("backup non valido o upload troncato lasciano intatti i dati attivi", async (t) => {
  const f = await fixture(t);
  const before = f.db.snapshot();
  assert.equal((await f.upload(Buffer.from("non zip"))).statusCode, 422);
  assert.equal((await f.upload(f.zip, "archivio.txt")).statusCode, 422);
  await assert.rejects(
    f.restores.prepare(Readable.from(f.zip), "backup.zip", () => true),
    /512 MB/,
  );
  assert.deepEqual(f.db.snapshot(), before);
  assert.equal(f.db.recoveryPoints().length, 0);
});

test("un backup oltre 25 MB usa il limite dedicato al ripristino senza ereditare quello documentale", async (t) => {
  const f = await fixture(t);
  const source = populate(
    join(f.root, "large-source"),
    "Backup con più versioni",
    true,
  );
  try {
    const docs = new DocumentService(source);
    for (let version = 0; version < 2; version++) {
      const document = source.list("documents")[0];
      docs.upload(
        document.id,
        `versione-${version}.txt`,
        randomBytes(13 * 1024 * 1024),
        document.revision,
      );
    }
    const bytes = await archive(source, join(f.root, "large.zip"));
    assert.ok(bytes.length > 25 * 1024 * 1024);
    const result = await f.upload(bytes);
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json<RestorePreview>().files, 3);
    assert.equal(f.db.list("operations")[0].title, "Operazione attuale");
  } finally {
    source.close();
  }
});

test("un dataset attivo mancante arresta l’avvio senza ricreare dati iniziali", async (t) => {
  const f = await fixture(t);
  await f.confirm((await f.upload()).json<RestorePreview>());
  const databasePath = resolve(f.db.dataDir, "casa.sqlite");
  await f.app.close();
  rmSync(databasePath);
  assert.throws(() => new Database(f.currentPath), /Dataset attivo assente/);
  assert.equal(existsSync(databasePath), false);
});

test("verifica scaduta e file alterato prima della conferma non vengono attivati", async (t) => {
  const f = await fixture(t);
  let preview = (await f.upload()).json<RestorePreview>();
  const meta = resolve(
    f.currentPath,
    "restore-staging",
    preview.id,
    "preview.json",
  );
  const stored = JSON.parse(readFileSync(meta, "utf8"));
  stored.expiresAt = "2000-01-01T00:00:00.000Z";
  writeFileSync(meta, JSON.stringify(stored));
  assert.equal((await f.confirm(preview)).statusCode, 410);
  preview = (await f.upload()).json<RestorePreview>();
  const stage = resolve(
    f.currentPath,
    "restore-staging",
    preview.id,
    "dataset",
  );
  const candidate = new Database(stage);
  const hash = String(candidate.list("document_versions")[0].hash);
  candidate.close();
  writeFileSync(resolve(stage, "documents", hash), "alterato");
  assert.throws(
    () => f.restores.commit(preview.id, preview.expectedState, "RIPRISTINA"),
    /Integrità/,
  );
  assert.equal(f.db.generation, "legacy");
});

test("fallimento del cambio di puntatore conserva il database originale aperto e la verifica ripetibile", async (t) => {
  const f = await fixture(t);
  const preview = (await f.upload()).json<RestorePreview>();
  mkdirSync(join(f.currentPath, "active-dataset.json"));
  assert.throws(() =>
    f.restores.commit(preview.id, preview.expectedState, "RIPRISTINA"),
  );
  assert.equal(f.db.list("operations")[0].title, "Operazione attuale");
  assert.equal(f.db.generation, "legacy");
  assert.ok(
    existsSync(
      resolve(
        f.currentPath,
        "restore-staging",
        preview.id,
        "dataset",
        "casa.sqlite",
      ),
    ),
  );
  rmSync(join(f.currentPath, "active-dataset.json"), { recursive: true });
  assert.equal((await f.confirm(preview)).statusCode, 200);
});

test("le copie precedenti restano recuperabili anche dopo un secondo ripristino", async (t) => {
  const f = await fixture(t);
  const first = (
    await f.confirm((await f.upload()).json<RestorePreview>())
  ).json<RestoreResult>();
  const previous = await f.app.inject(
    `/api/restores/recovery/${first.recoveryPointId}/backup`,
  );
  const preview = (await f.upload(previous.rawPayload)).json<RestorePreview>();
  const second = await f.confirm(preview);
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(f.db.list("operations")[0].title, "Operazione attuale");
  assert.equal(f.db.recoveryPoints().length, 2);
  assert.equal(f.db.recoveryPoints()[1].id, first.recoveryPointId);
});

test("API ripristino protette da autenticazione e origine, inclusi percorsi codificati", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "home-manager-restore-auth-"));
  const f = await buildApp({
    dataDir: root,
    password: "password-di-test-lunga",
  });
  t.after(async () => {
    await f.app.close();
    rmSync(root, { recursive: true, force: true });
  });
  assert.equal((await f.app.inject("/api/restores")).statusCode, 401);
  assert.equal((await f.app.inject("/%61pi/restores")).statusCode, 401);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: "/api/restores/preview",
        headers: { origin: "https://un-altro-sito.example" },
      })
    ).statusCode,
    403,
  );
  const login = await f.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { password: "password-di-test-lunga" },
  });
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  assert.equal(
    (await f.app.inject({ url: "/api/restores", headers: { cookie } }))
      .statusCode,
    200,
  );
});

test(
  "un caricamento di documento già in corso viene rifiutato se nel frattempo cambia il dataset",
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    let started!: () => void;
    const uploadStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.app.addHook("preHandler", async (req) => {
      if (req.routeOptions.url === "/api/documents/:id/versions") started();
    });
    const preview = (await f.upload()).json<RestorePreview>();
    const document = f.db.list("documents")[0];
    const base = await f.app.listen({ port: 0, host: "127.0.0.1" });
    const boundary = "upload-concorrente";
    const req = httpRequest(`${base}/api/documents/${document.id}/versions`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "If-Match": String(document.revision),
      },
    });
    const response = new Promise<number>((resolve, reject) => {
      req.on("response", (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode!));
      });
      req.on("error", reject);
    });
    try {
      req.write(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="nuovo.txt"\r\nContent-Type: text/plain\r\n\r\nPrimo frammento`,
      );
      await uploadStarted;
      const result = await f.confirm(preview);
      assert.equal(result.statusCode, 200, result.body);
      req.end(` e ultimo frammento\r\n--${boundary}--\r\n`);
      assert.equal(await response, 409);
      assert.equal(f.db.list("document_versions").length, 1);
    } finally {
      req.destroy();
    }
  },
);
