import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  createWriteStream,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import archiver from "archiver";
import { buildApp } from "../server/app.js";
import { createArchive, csv } from "../server/reports.js";
import { restoreArchive } from "../server/backup.js";
import {
  calculateScenario,
  entities,
  monthlyPayment,
  schemaFor,
  localToday,
  type Row,
  type Scalar,
} from "../shared/model.js";

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = mkdtempSync(join(tmpdir(), "home-manager-test-"));
  const result = await buildApp({
    dataDir: join(root, "data"),
    initialDataFile: fileURLToPath(
      new URL("./fixtures/demo-data.json", import.meta.url),
    ),
  });
  t.after(async () => {
    await result.app.close();
    rmSync(root, { recursive: true, force: true });
  });
  const operation = result.db.list("operations")[0];
  const purchase = result.db
    .list("transactions")
    .find((r) => r.kind === "purchase")!;
  const update = (
    entity: string,
    row: Row,
    changes: Record<string, Scalar>,
    confirm = false,
  ) =>
    result.service.save(
      entity,
      {
        ...Object.fromEntries(
          Object.keys(entities[entity].fields).map((k) => [k, row[k]]),
        ),
        ...changes,
      },
      row.id,
      row.revision,
      confirm,
    );
  return { ...result, root, operation, purchase, update };
}

test("rata: tasso zero, formula standard e parametri invalidi", () => {
  assert.equal(monthlyPayment(12000000, 0, 10), 100000);
  assert.equal(monthlyPayment(20000000, 3, 25), 94842);
  assert.throws(() => monthlyPayment(10000, -1, 25));
  assert.throws(() => monthlyPayment(10000, 3, 0));
  assert.throws(() => monthlyPayment(10000, 3, 2.5));
});
test("data locale segue Europe/Rome anche vicino a mezzanotte UTC", () => {
  assert.equal(localToday(new Date("2026-10-27T23:30:00Z")), "2026-10-28");
});
test("schema rifiuta denaro frazionario, date inesistenti e campi aggiuntivi", () => {
  assert.equal(
    schemaFor("movements").safeParse({
      title: "x",
      operation_id: "bad",
      amount: 1.5,
      direction: "in",
    }).success,
    false,
  );
  assert.equal(
    schemaFor("people").safeParse({ title: "Mario", injected: "x" }).success,
    false,
  );
  assert.equal(
    schemaFor("people").safeParse({
      title: "Mario",
      last_contact: "2030-02-30",
    }).success,
    false,
  );
});
test("fixture sintetica: vendita aperta, liquidità ignota, nessun documento verificato", async (t) => {
  const f = await fixture(t);
  const sale = f.db.list("transactions").find((r) => r.kind === "sale")!;
  assert.equal(f.operation.current_liquidity, null);
  assert.equal(sale.final_price, null);
  assert.equal(sale.preliminary_date, null);
  assert.equal(sale.remaining_mortgage, null);
  assert.equal(
    f.db.list("documents").filter((d) => d.status === "verified").length,
    0,
  );
  assert.equal(
    f.db.list("obligations").filter((d) => d.status === "fulfilled").length,
    0,
  );
  assert.equal(f.db.sql.prepare("PRAGMA foreign_key_check").all().length, 0);
});
test("scenari: caparra conteggiata una sola volta, costi lavori aggregati e zero entrate straordinarie", async (t) => {
  const f = await fixture(t);
  const s = f.db.list("scenarios").find((s) => s.title === "Centrale")!;
  const result = calculateScenario(f.purchase, s);
  assert.equal(result.balance, 24000000);
  assert.equal(result.netSale, 17000000);
  assert.equal(result.fundingGap, 7900000);
  assert.equal(result.residual, 200000);
  assert.equal(s.extraordinary_verified, 0);
  assert.equal(result.reserveMargin, 0);
});
test("revisioni impediscono sovrascritture concorrenti e audit registra il prima/dopo", async (t) => {
  const f = await fixture(t);
  f.update("operations", f.operation, { title: "Titolo aggiornato" });
  assert.throws(
    () => f.update("operations", f.operation, { title: "Vecchia revisione" }),
    /modificato/,
  );
  const event = f.db
    .list("audit_events")
    .find((a) => a.entity_id === f.operation.id && a.action === "update")!;
  assert.equal(JSON.parse(String(event.before_json)).title, f.operation.title);
  assert.equal(JSON.parse(String(event.after_json)).title, "Titolo aggiornato");
});
test("vincoli referenziali bloccano eliminazione di immobili in uso", async (t) => {
  const f = await fixture(t);
  const property = f.db.get("properties", String(f.purchase.property_id))!;
  assert.throws(
    () => f.db.remove("properties", property.id, property.revision),
    /FOREIGN KEY/,
  );
});
test("obbligo non chiudibile senza prova verificata", async (t) => {
  const f = await fixture(t);
  const obligation = f.db.list("obligations")[0];
  assert.throws(
    () => f.update("obligations", obligation, { status: "fulfilled" }),
    /documento di evidenza/,
  );
});
test("documento senza file non verificabile", async (t) => {
  const f = await fixture(t);
  const document = f.db.list("documents")[0];
  assert.throws(
    () => f.update("documents", document, { status: "verified" }),
    /Caricare un file/,
  );
});
test("upload: nomi sanitizzati, hash, duplicati, versioni e integrità", async (t) => {
  const f = await fixture(t);
  let doc = f.db.list("documents")[0];
  const bytes = Buffer.from("Prova privata");
  const v = f.docs.upload(doc.id, "../../privato.txt", bytes, doc.revision);
  assert.equal(v.filename, "privato.txt");
  assert.equal(v.version, 1);
  assert.deepEqual(f.docs.read(v.id).buffer, bytes);
  assert.throws(
    () =>
      f.docs.upload(
        doc.id,
        "falso.pdf",
        Buffer.from("not pdf"),
        f.db.get("documents", doc.id)!.revision,
      ),
    /formato/,
  );
  assert.throws(
    () =>
      f.docs.upload(
        doc.id,
        "duplicato.txt",
        bytes,
        f.db.get("documents", doc.id)!.revision,
      ),
    /già presente/,
  );
  doc = f.db.get("documents", doc.id)!;
  const v2 = f.docs.upload(
    doc.id,
    "privato.txt",
    Buffer.from("Seconda versione"),
    doc.revision,
  );
  assert.equal(v2.version, 2);
  assert.equal(f.docs.compare(v.id, v2.id).sameContent, false);
  writeFileSync(f.docs.path(String(v.hash)), "alterato");
  assert.throws(() => f.docs.read(v.id), /integrità/);
});
test("nuova versione invalida l’adempimento e conserva i termini contrattuali", async (t) => {
  const f = await fixture(t);
  let doc = f.db.list("documents")[0];
  f.docs.upload(doc.id, "prova.txt", Buffer.from("Prova 1"), doc.revision);
  doc = f.db.get("documents", doc.id)!;
  doc = f.update("documents", doc, { status: "verified" });
  const obligation = f.db.list("obligations")[0];
  const fulfilled = f.update("obligations", obligation, {
    status: "fulfilled",
    evidence_id: doc.id,
  });
  assert.equal(fulfilled.status, "fulfilled");
  f.docs.upload(doc.id, "prova.txt", Buffer.from("Prova 2"), doc.revision);
  assert.equal(f.db.get("obligations", obligation.id)?.status, "unverified");
  assert.equal(
    f.db.get("obligations", obligation.id)?.due_date,
    obligation.due_date,
  );
});
test("cicli nelle dipendenze e completamento prematuro bloccati", async (t) => {
  const f = await fixture(t);
  const link = f.db.list("task_dependencies")[0];
  const a = f.db.get("tasks", String(link.task_id))!;
  assert.throws(
    () => f.update("tasks", a, { status: "completed" }),
    /prerequisito/,
  );
  assert.throws(
    () =>
      f.service.save("task_dependencies", {
        title: "Ciclo",
        task_id: link.prerequisite_id,
        prerequisite_id: link.task_id,
      }),
    /ciclo/,
  );
});
test("ricorrenza mensile usa l’ultimo giorno valido senza spostare scadenze contrattuali", async (t) => {
  const f = await fixture(t);
  const dates = f.db.list("deadlines").map((d) => d.due_date);
  const task = f.service.save("tasks", {
    title: "Ricorrente",
    operation_id: f.operation.id,
    due_date: "2030-01-31",
    recurrence: "monthly",
  });
  f.update("tasks", task, { status: "completed" });
  assert.ok(
    f.db
      .list("tasks")
      .some(
        (t) =>
          t.title === "Ricorrente" &&
          t.due_date === "2030-02-28" &&
          t.status === "todo",
      ),
  );
  assert.deepEqual(
    f.db.list("deadlines").map((d) => d.due_date),
    dates,
  );
});
test("modifica scadenza contrattuale e salto di stato richiedono conferma esplicita", async (t) => {
  const f = await fixture(t);
  const deadline = f.db.list("deadlines")[0];
  assert.throws(
    () => f.update("deadlines", deadline, { due_date: "2030-12-01" }),
    /conferma/,
  );
  assert.equal(
    f.update("deadlines", deadline, { due_date: "2030-12-01" }, true).due_date,
    "2030-12-01",
  );
  const first = f.db.list("transaction_states").find((s) => s.rank === 0)!;
  assert.throws(
    () => f.update("transactions", f.purchase, { status: first.id }),
    /conferma/,
  );
});
test("modifica clausola segnala obblighi impattati senza cambiare il termine", async (t) => {
  const f = await fixture(t);
  const clause = f.db.list("contract_clauses")[0];
  const obligation = f.db
    .list("obligations")
    .find((o) => o.clause_id === clause.id)!;
  f.update("contract_clauses", clause, { reference_text: "Nuovo estratto" });
  const affected = f.db.get("obligations", obligation.id)!;
  assert.equal(affected.status, "unverified");
  assert.match(String(affected.notes), /riesaminare/);
  assert.equal(affected.due_date, obligation.due_date);
});
test("cash flow: saldo sconosciuto non produce disponibilità inventate", async (t) => {
  const f = await fixture(t);
  assert.equal(f.service.cashTimeline(f.operation.id).openingKnown, false);
  assert.equal(f.service.cashTimeline(f.operation.id).opening, null);
});
test("cash flow: saldo datato, esclusione pagamenti già inclusi e ordine prudenziale nello stesso giorno", async (t) => {
  const f = await fixture(t);
  f.update("operations", f.operation, {
    current_liquidity: 500000,
    liquidity_state: "confirmed",
    liquidity_date: "2026-10-01",
  });
  f.service.save("movements", {
    title: "Caparra già inclusa",
    operation_id: f.operation.id,
    amount: 2000000,
    direction: "out",
    category: "deposit",
    status: "paid",
    actual_date: "2026-09-01",
  });
  f.service.save("movements", {
    title: "Vendita prevista",
    operation_id: f.operation.id,
    amount: 18000000,
    direction: "in",
    status: "expected",
    expected_date: "2030-10-15",
  });
  f.service.save("movements", {
    title: "Saldo acquisto",
    operation_id: f.operation.id,
    amount: 24000000,
    direction: "out",
    status: "expected",
    expected_date: "2030-10-15",
  });
  const result = f.service.cashTimeline(f.operation.id);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.events[0].direction, "out");
  assert.equal(result.events[0].projectedBalance, -23500000);
  assert.equal(result.events[0].actualBalance, 500000);
  assert.equal(result.events[0].sameDayOrderUnverified, true);
});
test("delibera mutuo non altera liquidità né crea un incasso", async (t) => {
  const f = await fixture(t);
  const m = f.db.list("mortgages")[0];
  f.update("mortgages", m, { status: "approved", approved_amount: 15000000 });
  assert.equal(f.service.cashTimeline(f.operation.id).events.length, 0);
  assert.throws(
    () =>
      f.update("mortgages", f.db.get("mortgages", m.id)!, {
        status: "disbursed",
      }),
    /erogazione/,
  );
});
test("checklist vuote o con requisiti aperti non dichiarano pronti al rogito", async (t) => {
  const f = await fixture(t);
  assert.ok(
    f.service
      .dashboard()
      .readiness.every((c) => !c.organizationalReady && c.verified === 0),
  );
  const item = f.db.list("checklist_items")[0];
  assert.throws(
    () => f.update("checklist_items", item, { status: "verified" }),
    /documento di evidenza/,
  );
});
test("API REST: validazione, revisioni, eliminazione controllata e OpenAPI", async (t) => {
  const f = await fixture(t);
  let response = await f.app.inject({
    method: "POST",
    url: "/api/entities/people",
    payload: { title: "Contatto test" },
  });
  assert.equal(response.statusCode, 201);
  const person = response.json<Row>();
  response = await f.app.inject({
    method: "DELETE",
    url: `/api/entities/people/${person.id}`,
    payload: { revision: person.revision, confirmTitle: "sbagliato" },
  });
  assert.equal(response.statusCode, 422);
  response = await f.app.inject({
    method: "DELETE",
    url: `/api/entities/people/${person.id}`,
    payload: { revision: person.revision, confirmTitle: person.title },
  });
  assert.equal(response.statusCode, 200);
  response = await f.app.inject("/api/openapi.json");
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().openapi, "3.1.0");
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: "/api/entities/people",
        payload: { title: "" },
      })
    ).statusCode,
    422,
  );
});
test("autenticazione: cookie firmato, blocco CSRF e login errato", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "home-manager-test-"));
  const { app } = await buildApp({
    dataDir: root,
    password: "test-password-at-least-16",
  });
  t.after(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });
  assert.equal((await app.inject("/api/bootstrap")).statusCode, 401);
  assert.equal((await app.inject("/%61pi/bootstrap")).statusCode, 401);
  assert.equal((await app.inject("/api/auth/../bootstrap")).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: "errata" },
      })
    ).statusCode,
    401,
  );
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { password: "test-password-at-least-16" },
  });
  assert.equal(login.statusCode, 200);
  const rawCookie = String(login.headers["set-cookie"]).split(";")[0];
  assert.equal(
    (
      await app.inject({
        url: "/api/bootstrap",
        headers: { cookie: rawCookie },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/entities/people",
        headers: { cookie: rawCookie, origin: "https://evil.test" },
        payload: { title: "Intruso" },
      })
    ).statusCode,
    403,
  );
});
test("Ingress accetta solo il proxy Supervisor; un header non sostituisce l’IP", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "home-manager-test-"));
  const { app } = await buildApp({ dataDir: root, ingressOnly: true });
  t.after(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });
  assert.equal(
    (
      await app.inject({
        url: "/api/bootstrap",
        remoteAddress: "10.0.0.2",
        headers: { "x-forwarded-for": "172.30.32.2" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ url: "/api/bootstrap", remoteAddress: "172.30.32.2" }))
      .statusCode,
    200,
  );
  assert.equal((await app.inject("/api/health")).statusCode, 200);
});
test("export: CSV sicuro e strutturato, JSON completo e PDF valido", async (t) => {
  const f = await fixture(t);
  const csvResult = csv(
    [
      {
        id: "x",
        revision: 1,
        created_at: "",
        updated_at: "",
        title: '=HYPERLINK("evil")',
      },
    ],
    ["title"],
  );
  assert.ok(csvResult.includes("'=HYPERLINK"));
  const json = await f.app.inject("/api/export/json");
  assert.equal(
    Object.keys(json.json().data).length,
    Object.keys(entities).length + 2,
  );
  const pdf = await f.app.inject("/api/export/pdf/all");
  assert.equal(pdf.statusCode, 200);
  assert.ok(pdf.rawPayload.subarray(0, 5).equals(Buffer.from("%PDF-")));
});
test("backup e ripristino: round-trip di database, documenti e hash; nessuna sovrascrittura", async (t) => {
  const f = await fixture(t);
  const doc = f.db.list("documents")[0];
  const v = f.docs.upload(
    doc.id,
    "ricevuta.txt",
    Buffer.from("Archivio privato di test"),
    doc.revision,
  );
  const archive = createArchive(f.db);
  const zip = join(f.root, "backup.zip");
  const complete = pipeline(archive, createWriteStream(zip));
  await archive.finalize();
  await complete;
  const into = join(f.root, "restored");
  const restored = await restoreArchive(zip, into);
  assert.equal(restored.files, 1);
  assert.ok(
    readFileSync(resolve(into, "documents", String(v.hash))).equals(
      Buffer.from("Archivio privato di test"),
    ),
  );
  const app2 = await buildApp({ dataDir: into });
  try {
    assert.equal(app2.db.list("operations").length, 1);
    assert.equal(app2.db.list("document_versions").length, 1);
    assert.equal(app2.db.list("operations")[0].id, f.operation.id);
  } finally {
    await app2.app.close();
  }
  await assert.rejects(restoreArchive(zip, into), /vuota/);
});
test("ripristino rifiuta percorsi estranei al formato prima di scrivere fuori dallo staging", async (t) => {
  const f = await fixture(t);
  const archive = archiver("zip");
  const zip = join(f.root, "invalid.zip");
  const complete = pipeline(archive, createWriteStream(zip));
  archive.append("malicious", { name: "outside.txt" });
  await archive.finalize();
  await complete;
  await assert.rejects(
    restoreArchive(zip, join(f.root, "rejected")),
    /Percorso ZIP/,
  );
});

test("revoca manuale di una prova invalida anche le checklist dipendenti", async (t) => {
  const f = await fixture(t);
  let doc = f.db.list("documents")[0];
  f.docs.upload(
    doc.id,
    "test.txt",
    Buffer.from("prova revocabile"),
    doc.revision,
  );
  doc = f.update("documents", f.db.get("documents", doc.id)!, {
    status: "verified",
  });
  const items = f.db.list("checklist_items");
  const a = f.update("checklist_items", items[0], {
    status: "verified",
    evidence_id: doc.id,
  });
  const b = f.update("checklist_items", items[1], {
    status: "verified",
    evidence_id: doc.id,
    depends_on_id: a.id,
  });
  f.update("documents", doc, { status: "unverified" });
  assert.equal(f.db.get("checklist_items", a.id)?.status, "unverified");
  assert.equal(f.db.get("checklist_items", b.id)?.status, "unverified");
});

test("incasso futuro e scostamento non diventano disponibilità attuale", async (t) => {
  const f = await fixture(t);
  f.update("operations", f.operation, {
    current_liquidity: 500000,
    liquidity_state: "confirmed",
    liquidity_date: "2026-10-01",
  });
  f.service.save("movements", {
    title: "Incassato ma non ancora disponibile",
    operation_id: f.operation.id,
    amount: 100000,
    actual_amount: 90000,
    direction: "in",
    status: "received",
    actual_date: "2026-10-20",
    availability_date: "2030-10-15",
  });
  const e = f.service.cashTimeline(f.operation.id).events[0];
  assert.equal(e.actual, false);
  assert.equal(e.actualBalance, 500000);
  assert.equal(e.projectedBalance, 590000);
  assert.equal(e.variance, -10000);
});

test("richiesta multipart carica un file e il download restituisce l’originale", async (t) => {
  const f = await fixture(t);
  const doc = f.db.list("documents")[0];
  const boundary = "casa-test-boundary";
  const bytes = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="prova.txt"\r\nContent-Type: text/plain\r\n\r\nProva HTTP\r\n--${boundary}--\r\n`,
  );
  const upload = await f.app.inject({
    method: "POST",
    url: `/api/documents/${doc.id}/versions`,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "if-match": String(doc.revision),
    },
    payload: bytes,
  });
  assert.equal(upload.statusCode, 200, upload.body);
  const version = upload.json<Row>();
  const download = await f.app.inject(`/api/versions/${version.id}/file`);
  assert.equal(download.body, "Prova HTTP");
  assert.match(String(download.headers["content-disposition"]), /attachment/);
});

test("scritture Ingress riconoscono l’origine senza presumere header proxy opzionali", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "home-manager-test-"));
  const { app } = await buildApp({ dataDir: root, ingressOnly: true });
  t.after(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });
  const ok = await app.inject({
    method: "POST",
    url: "/api/entities/people",
    remoteAddress: "172.30.32.2",
    headers: {
      origin: "http://homeassistant.local:8123",
      "sec-fetch-site": "same-origin",
    },
    payload: { title: "Contatto da Ingress" },
  });
  assert.equal(ok.statusCode, 201);
  const no = await app.inject({
    method: "POST",
    url: "/api/entities/people",
    remoteAddress: "172.30.32.2",
    headers: { origin: "https://evil.test", "sec-fetch-site": "cross-site" },
    payload: { title: "Richiesta esterna" },
  });
  assert.equal(no.statusCode, 403);
});
