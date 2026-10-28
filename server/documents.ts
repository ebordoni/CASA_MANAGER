import { createHash } from "node:crypto";
import { basename, extname, resolve } from "node:path";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { AppError, Database } from "./database.js";
import { invalidateEvidence } from "./evidence.js";

export class DocumentService {
  constructor(public db: Database) {}
  path(hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash))
      throw new AppError(422, "Hash file non valido");
    return resolve(this.db.dataDir, "documents", hash);
  }
  upload(
    id: string,
    originalName: string,
    buffer: Buffer,
    expectedRevision: number,
  ) {
    const document = this.db.get("documents", id);
    if (!document) throw new AppError(404, "Documento non trovato");
    if (document.revision !== expectedRevision)
      throw new AppError(
        409,
        "Documento modificato: ricaricare prima di caricare una versione",
      );
    if (!buffer.length || buffer.length > 25 * 1024 * 1024)
      throw new AppError(422, "File vuoto o superiore a 25 MB");
    const filename = basename(originalName.replaceAll("\\", "/"))
      .replace(/[\r\n\x00-\x1f"<>]/g, "_")
      .slice(0, 200);
    const extension = extname(filename).toLowerCase();
    const formats: Record<string, string> = {
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".txt": "text/plain",
      ".eml": "text/plain",
      ".csv": "text/plain",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".odt": "application/vnd.oasis.opendocument.text",
    };
    const mime = formats[extension];
    if (!mime)
      throw new AppError(
        422,
        "Formato non supportato: PDF, immagini, TXT, EML, CSV, DOCX, XLSX o ODT",
      );
    const starts = (hex: string) =>
      buffer.subarray(0, hex.length / 2).toString("hex") === hex;
    if (
      (extension === ".pdf" && !starts("255044462d")) ||
      (extension === ".png" && !starts("89504e470d0a1a0a")) ||
      ([".jpg", ".jpeg"].includes(extension) && !starts("ffd8ff")) ||
      (extension === ".webp" &&
        !(
          buffer.toString("ascii", 0, 4) === "RIFF" &&
          buffer.toString("ascii", 8, 12) === "WEBP"
        )) ||
      ([".docx", ".xlsx", ".odt"].includes(extension) && !starts("504b0304"))
    )
      throw new AppError(
        422,
        "Il contenuto del file non corrisponde al formato dichiarato",
      );
    const hash = createHash("sha256").update(buffer).digest("hex");
    const duplicate = this.db
      .list("document_versions")
      .find((v) => v.hash === hash);
    if (duplicate)
      throw new AppError(
        409,
        `File già presente nell’archivio: ${this.db.get("documents", String(duplicate.document_id))?.title ?? duplicate.filename}. Collegare il documento esistente.`,
      );
    const filePath = this.path(hash);
    const existed = existsSync(filePath);
    if (!existed) writeFileSync(filePath, buffer, { flag: "wx", mode: 0o600 });
    try {
      return this.db.atomic(() => {
        const versions = this.db
          .list("document_versions")
          .filter((v) => v.document_id === id);
        const version =
          versions.reduce((max, v) => Math.max(max, Number(v.version)), 0) + 1;
        const saved = this.db.insert("document_versions", {
          document_id: id,
          version,
          filename,
          mime,
          size: buffer.length,
          hash,
        });
        this.db.update(
          "documents",
          id,
          { status: "unverified" },
          document.revision,
        );
        invalidateEvidence(
          this.db,
          id,
          "Nuova versione della prova: verifica da ripetere.",
        );
        return saved;
      });
    } catch (error) {
      if (!existed) unlinkSync(filePath);
      throw error;
    }
  }
  read(versionId: string) {
    const version = this.db.get("document_versions", versionId);
    if (!version) throw new AppError(404, "Versione non trovata");
    const filePath = this.path(String(version.hash));
    if (!existsSync(filePath))
      throw new AppError(
        409,
        "File mancante: ripristinare un backup verificato",
      );
    const buffer = readFileSync(filePath);
    if (createHash("sha256").update(buffer).digest("hex") !== version.hash)
      throw new AppError(
        409,
        "Verifica integrità fallita: hash non corrispondente",
      );
    return { version, buffer };
  }
  remove(id: string, revision: number) {
    const versions = this.db
      .list("document_versions")
      .filter((v) => v.document_id === id);
    this.db.atomic(() => {
      for (const version of versions)
        this.db.remove("document_versions", version.id, version.revision);
      this.db.remove("documents", id, revision);
    });
    for (const version of versions) {
      const path = this.path(String(version.hash));
      if (existsSync(path)) unlinkSync(path);
    }
  }
  compare(beforeId: string, afterId: string) {
    const a = this.db.get("document_versions", beforeId);
    const b = this.db.get("document_versions", afterId);
    if (!a || !b || a.document_id !== b.document_id)
      throw new AppError(422, "Scegliere due versioni dello stesso documento");
    return {
      before: a,
      after: b,
      sameContent: a.hash === b.hash,
      note: "Confronto di metadati e integrità. Per PDF e immagini aprire le anteprime affiancate; nessuna interpretazione legale automatica.",
    };
  }
}
