import PDFDocument from "pdfkit";
import archiver from "archiver";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { Database } from "./database.js";
import {
  entities,
  labels,
  moneyFormat,
  type Row,
  type Scalar,
} from "../shared/model.js";
import { Service } from "./service.js";

export function csv(rows: Row[], columns: string[]) {
  const escape = (input: Scalar | undefined) => {
    let value = input === null || input === undefined ? "" : String(input);
    if (/^[\s]*[=+\-@\t\r]/.test(value)) value = `'${value}`;
    return `"${value.replaceAll('"', '""')}"`;
  };
  return (
    columns.map(escape).join(",") +
    "\r\n" +
    rows
      .map((row) => columns.map((key) => escape(row[key])).join(","))
      .join("\r\n")
  );
}

export function createArchive(db: Database, fullBackup = true) {
  const temp = resolve(db.dataDir, "tmp", randomUUID());
  mkdirSync(temp, { recursive: true, mode: 0o700 });
  // Synchronous SQLite snapshot + metadata capture run in one event-loop turn: no concurrent mutation can interleave.
  db.sql.prepare("VACUUM INTO ?").run(resolve(temp, "casa.sqlite"));
  // Read metadata from the snapshot too: the CLI may run beside the server in another process.
  const snapshotDb = new Database(temp);
  let snapshot: ReturnType<Database["snapshot"]>;
  try {
    snapshot = snapshotDb.snapshot();
  } finally {
    snapshotDb.close();
  }
  const files = snapshot.document_versions.map((v) => ({
    versionId: v.id,
    hash: v.hash,
    documentId: v.document_id,
    filename: v.filename,
  }));
  const manifest = {
    format: "casa-manager-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    files,
    tables: Object.fromEntries(
      Object.entries(snapshot).map(([k, rows]) => [k, rows.length]),
    ),
  };
  writeFileSync(
    resolve(temp, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  writeFileSync(
    resolve(temp, "export.json"),
    JSON.stringify(snapshot, null, 2),
    { mode: 0o600 },
  );
  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.file(resolve(temp, "manifest.json"), { name: "manifest.json" });
  archive.file(resolve(temp, "export.json"), { name: "export.json" });
  if (fullBackup)
    archive.file(resolve(temp, "casa.sqlite"), { name: "casa.sqlite" });
  for (const file of files) {
    const path = resolve(db.dataDir, "documents", String(file.hash));
    const bytes = existsSync(path) ? readFileSync(path) : null;
    if (
      !bytes ||
      createHash("sha256").update(bytes).digest("hex") !== file.hash
    ) {
      rmSync(temp, { recursive: true, force: true });
      throw new Error(`File mancante o corrotto: ${file.filename}`);
    }
    // Capture bytes now: a later document deletion must not invalidate a backup already streaming.
    const captured = resolve(temp, String(file.hash));
    writeFileSync(captured, bytes, { mode: 0o600 });
    archive.file(captured, {
      name: fullBackup
        ? `documents/${file.hash}`
        : `archivio/${file.documentId}/${file.versionId}-${String(file.filename).replace(/[^\p{L}\p{N}._ -]/gu, "_")}`,
    });
  }
  const cleanup = () => rmSync(temp, { recursive: true, force: true });
  archive.once("end", cleanup);
  archive.once("error", cleanup);
  archive.once("close", cleanup);
  return archive;
}

export function pdfReport(service: Service, scope: string) {
  const db = service.db;
  const pdf = new PDFDocument({
    size: "A4",
    margin: 45,
    bufferPages: true,
    info: { Title: "home manager · Report operazione", Author: "home manager" },
  });
  const data = db.snapshot();
  const operation = data.operations[0];
  pdf.fillColor("#123b37").fontSize(23).text("home manager");
  pdf.fontSize(16).text(String(operation?.title ?? "Report operazione"));
  pdf
    .moveDown()
    .fontSize(9)
    .fillColor("#64706e")
    .text(
      `Esportato il ${new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date())}`,
    );
  pdf
    .moveDown()
    .fontSize(10)
    .fillColor("#222222")
    .text(
      "Riepilogo organizzativo. Dati stimati e da verificare non costituiscono conferme. Checklist e report non certificano conformità o stipulabilità: verificare con notaio e professionisti.",
    );
  const sections =
    scope === "all"
      ? Object.keys(entities).filter(
          (k) => !["settings", "transaction_states"].includes(k),
        )
      : scope === "missing-documents"
        ? ["documents"]
        : scope === "open-obligations"
          ? ["obligations"]
          : scope === "completed-tasks"
            ? ["tasks"]
            : [scope];
  for (const entity of sections) {
    const def = entities[entity];
    if (!def) continue;
    let rows = data[entity];
    if (scope === "missing-documents")
      rows = rows.filter(
        (r) => !["verified", "archived", "replaced"].includes(String(r.status)),
      );
    if (scope === "open-obligations")
      rows = rows.filter(
        (r) => !["fulfilled", "waived"].includes(String(r.status)),
      );
    if (scope === "completed-tasks")
      rows = rows.filter((r) => r.status === "completed");
    if (pdf.y > 680) pdf.addPage();
    pdf.moveDown().fillColor("#123b37").fontSize(14).text(def.label);
    if (!rows.length)
      pdf.fillColor("#64706e").fontSize(10).text("Nessun elemento registrato.");
    for (const row of rows) {
      if (pdf.y > 680) pdf.addPage();
      pdf
        .moveDown(0.6)
        .fillColor("#222222")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(String(row.title));
      pdf.font("Helvetica").fontSize(9);
      const reportFields = [
        ...new Set([
          ...def.columns,
          ...Object.entries(def.fields)
            .filter(
              ([key, field]) =>
                field.type === "money" ||
                ["confidence", "price_state", "liquidity_state"].includes(key),
            )
            .map(([key]) => key),
        ]),
      ].filter((k) => k !== "title");
      for (const key of reportFields) {
        const field = def.fields[key];
        const value = row[key];
        const rendered = field?.ref
          ? String(db.get(field.ref, String(value))?.title ?? "Da inserire")
          : field?.type === "money"
            ? moneyFormat(value)
            : (field?.type === "date" ||
                  field?.type === "datetime" ||
                  key === "updated_at") &&
                value
              ? new Intl.DateTimeFormat("it-IT", {
                  dateStyle: "medium",
                  timeZone: "Europe/Rome",
                }).format(
                  new Date(
                    String(value).length === 10
                      ? `${value}T12:00:00Z`
                      : String(value),
                  ),
                )
              : (labels[String(value)] ??
                (value === null ? "Da inserire" : String(value)));
        pdf.text(
          `${field?.label ?? (key === "updated_at" ? "Ultima modifica" : key)}: ${rendered}`,
        );
      }
      if (row.notes) pdf.text(`Note: ${row.notes}`);
      if (entity === "scenarios") {
        const scenario = service
          .dashboard()
          .scenarios.find((s) => s.scenario.id === row.id);
        if (scenario)
          pdf
            .text(
              `Fabbisogno mutuo stimato: ${moneyFormat(scenario.result.fundingGap)} | Rata stimata: ${moneyFormat(scenario.result.monthlyPayment)}`,
            )
            .text(String(row.assumptions));
      }
    }
  }
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    const bottom = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    pdf
      .fontSize(8)
      .fillColor("#64706e")
      .text(`home manager · ${i + 1} / ${range.count}`, 45, 802, {
        align: "right",
        lineBreak: false,
      });
    pdf.page.margins.bottom = bottom;
  }
  return pdf;
}
