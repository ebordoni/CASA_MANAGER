import Fastify, { LogController, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import { entities, schemaFor } from "../shared/model.js";
import { AppError, Database } from "./database.js";
import { Service } from "./service.js";
import { seed } from "./seed.js";
import { DocumentService } from "./documents.js";
import { createArchive, csv, pdfReport } from "./reports.js";
import { reminders } from "./notifications.js";
import { RestoreManager } from "./restore-manager.js";
import { MAX_BACKUP_BYTES } from "../shared/backup.js";
import { APP_VERSION } from "../shared/version.js";

type Options = {
  dataDir: string;
  initialDataFile?: string;
  password?: string;
  ingressOnly?: boolean;
  logger?: boolean;
  webDir?: string;
  cookieSecure?: boolean;
};
export async function buildApp(options: Options) {
  const db = new Database(options.dataDir);
  const service = new Service(db);
  seed(service, options.initialDataFile);
  const docs = new DocumentService(db);
  const restores = new RestoreManager(db);
  const requestGenerations = new WeakMap<FastifyRequest, string>();
  const assertGeneration = (request: FastifyRequest) => {
    const started = requestGenerations.get(request);
    if (started && started !== db.generation)
      throw new AppError(
        409,
        "I dati sono stati ripristinati da un’altra finestra: ricaricare prima di salvare.",
      );
  };
  const app = Fastify({
    logger: options.logger
      ? {
          level: process.env.LOG_LEVEL ?? "info",
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            "req.body",
            "res.headers.set-cookie",
          ],
        }
      : false,
    bodyLimit: 1024 * 1024,
    trustProxy: false,
    logController: new LogController({ disableRequestLogging: true }),
  });
  app.addHook("onClose", async () => db.close());
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        frameSrc: ["'self'", "blob:"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  });
  const keyPath = resolve(db.rootDir, "session.key");
  if (!existsSync(keyPath))
    writeFileSync(keyPath, randomBytes(48).toString("hex"), { mode: 0o600 });
  await app.register(cookie, { secret: readFileSync(keyPath, "utf8") });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 1, parts: 2 },
  });
  app.addHook("onRequest", async (request, reply) => {
    // Use the matched route, not the raw URL: Fastify also matches percent-encoded path segments.
    const route = request.routeOptions.url ?? request.url.split("?")[0];
    if (route === "/api/health") return;
    if (
      options.ingressOnly &&
      !["172.30.32.2", "::ffff:172.30.32.2"].includes(request.ip)
    )
      throw new AppError(
        403,
        "Accesso consentito solo tramite Home Assistant Ingress",
      );
    if (
      !options.ingressOnly &&
      !options.password &&
      !["localhost", "127.0.0.1", "[::1]"].includes(request.hostname)
    )
      throw new AppError(403, "Configurare APP_PASSWORD per l’accesso di rete");
    if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
      const origin = request.headers.origin;
      const host = request.headers["x-forwarded-host"];
      const allowedHost =
        options.ingressOnly && typeof host === "string"
          ? host
          : request.headers.host;
      if (
        origin &&
        (options.ingressOnly && typeof host !== "string"
          ? request.headers["sec-fetch-site"] !== "same-origin"
          : new URL(origin).host !== allowedHost)
      )
        throw new AppError(403, "Origine della richiesta non consentita");
      if (request.headers["sec-fetch-site"] === "cross-site")
        throw new AppError(403, "Richiesta da un altro sito bloccata");
    }
    if (!route.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (
      ["/api/auth/status", "/api/auth/login", "/api/auth/logout"].includes(
        route,
      )
    )
      return;
    if (options.password && !options.ingressOnly) {
      const signed = request.cookies.casa_session
        ? request.unsignCookie(request.cookies.casa_session)
        : null;
      const issued = Number(signed?.value?.split(".")[0]);
      if (
        !signed?.valid ||
        !issued ||
        Date.now() - issued > 12 * 60 * 60 * 1000 ||
        issued > Date.now()
      )
        throw new AppError(401, "Accesso richiesto");
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply.code(422).send({
        message: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        issues: error.issues,
      });
    const err = error as Error & { statusCode?: number; code?: string };
    if (err.message.includes("FOREIGN KEY constraint"))
      return reply.code(409).send({
        message:
          "Elemento collegato ad altri dati. Rimuovere i collegamenti o archiviare l’elemento.",
      });
    if (err.message.includes("UNIQUE constraint"))
      return reply
        .code(409)
        .send({ message: "Questo elemento o collegamento esiste già." });
    const status =
      err.statusCode && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;
    if (status === 500) request.log.error({ err }, "request failed");
    return reply.code(status).send({
      message:
        status === 500
          ? "Errore interno. Consultare i log del servizio."
          : err.message,
    });
  });
  app.addHook("onRequest", async (request) => {
    const route = request.routeOptions.url ?? "";
    if (
      ["POST", "PUT", "DELETE", "PATCH"].includes(request.method) &&
      (route.startsWith("/api/entities/") ||
        route.startsWith("/api/documents/"))
    ) {
      const generation = request.headers["x-casa-generation"];
      if (
        (generation !== undefined && generation !== db.generation) ||
        (db.generation !== "legacy" && generation !== db.generation)
      )
        throw new AppError(
          409,
          "I dati sono stati ripristinati: ricaricare l’app prima di salvare.",
        );
      requestGenerations.set(request, db.generation);
    }
  });
  app.addHook("preHandler", async (request) => assertGeneration(request));
  app.get("/api/health", async () => ({
    status: db.sql.prepare("SELECT 1 AS ok").get()?.ok === 1 ? "ok" : "error",
    version: APP_VERSION,
  }));
  app.get("/api/auth/status", async (request) => {
    const signed = request.cookies.casa_session
      ? request.unsignCookie(request.cookies.casa_session)
      : null;
    const issued = Number(signed?.value?.split(".")[0]);
    return {
      required: !!options.password && !options.ingressOnly,
      authenticated:
        !!options.ingressOnly ||
        !options.password ||
        (!!signed?.valid &&
          issued > 0 &&
          issued <= Date.now() &&
          Date.now() - issued < 43200000),
    };
  });
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { password } = z
        .object({ password: z.string().max(1000) })
        .parse(request.body);
      if (
        !options.password ||
        !timingSafeEqual(
          createHash("sha256").update(password).digest(),
          createHash("sha256").update(options.password).digest(),
        )
      )
        throw new AppError(401, "Password non corretta");
      reply.setCookie(
        "casa_session",
        `${Date.now()}.${randomBytes(24).toString("hex")}`,
        {
          path: "/",
          signed: true,
          httpOnly: true,
          sameSite: "strict",
          secure: options.cookieSecure,
          maxAge: 43200,
        },
      );
      return { ok: true };
    },
  );
  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie("casa_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/bootstrap", async () => ({
    generation: db.generation,
    data: db.snapshot(),
    dashboard: service.dashboard(),
  }));
  app.get("/api/dashboard", async () => service.dashboard());
  app.get("/api/reminders", async () => reminders(service));
  app.get("/api/cash/:operationId", async (request) =>
    service.cashTimeline(
      z.object({ operationId: z.uuid() }).parse(request.params).operationId,
    ),
  );
  app.get("/api/entities/:entity", async (request) => {
    const { entity } = z
      .object({
        entity: z.enum(Object.keys(entities) as [string, ...string[]]),
      })
      .parse(request.params);
    return db.list(entity);
  });
  app.post("/api/entities/:entity", async (request, reply) => {
    const { entity } = z
      .object({
        entity: z.enum(Object.keys(entities) as [string, ...string[]]),
      })
      .parse(request.params);
    return reply.code(201).send(service.save(entity, request.body));
  });
  app.put("/api/entities/:entity/:id", async (request) => {
    const { entity, id } = z
      .object({
        entity: z.enum(Object.keys(entities) as [string, ...string[]]),
        id: z.uuid(),
      })
      .parse(request.params);
    const { revision, data, confirmTransition } = z
      .object({
        revision: z.number().int().positive(),
        data: z.unknown(),
        confirmTransition: z.boolean().optional(),
      })
      .strict()
      .parse(request.body);
    return service.save(entity, data, id, revision, confirmTransition);
  });
  app.delete("/api/entities/:entity/:id", async (request) => {
    const { entity, id } = z
      .object({
        entity: z.enum(Object.keys(entities) as [string, ...string[]]),
        id: z.uuid(),
      })
      .parse(request.params);
    const { revision, confirmTitle } = z
      .object({
        revision: z.number().int().positive(),
        confirmTitle: z.string(),
      })
      .strict()
      .parse(request.body);
    const row = db.get(entity, id);
    if (!row) throw new AppError(404, "Elemento non trovato");
    if (row.title !== confirmTitle)
      throw new AppError(
        422,
        "La conferma deve corrispondere al titolo esatto",
      );
    if (entity === "documents") docs.remove(id, revision);
    else db.atomic(() => db.remove(entity, id, revision));
    return { ok: true };
  });
  app.post("/api/documents/:id/versions", async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const revision = z.coerce
      .number()
      .int()
      .positive()
      .parse(request.headers["if-match"]);
    const part = await request.file();
    if (!part) throw new AppError(422, "Selezionare un file");
    const buffer = await part.toBuffer();
    assertGeneration(request);
    return docs.upload(id, part.filename, buffer, revision);
  });
  app.get("/api/versions/:id/file", async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const query = z
      .object({ inline: z.enum(["true", "false"]).optional() })
      .parse(request.query);
    const { buffer, version } = docs.read(id);
    const inline =
      query.inline === "true" &&
      (version.mime === "application/pdf" ||
        String(version.mime).startsWith("image/"));
    return reply
      .type(String(version.mime))
      .header(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(String(version.filename))}`,
      )
      .header(
        "Content-Security-Policy",
        "default-src 'none'; sandbox; frame-ancestors 'self'",
      )
      .send(buffer);
  });
  app.get("/api/documents/compare", async (request) => {
    const { before, after } = z
      .object({ before: z.uuid(), after: z.uuid() })
      .parse(request.query);
    return docs.compare(before, after);
  });
  app.get("/api/export/json", async (_request, reply) =>
    reply
      .header("Content-Disposition", 'attachment; filename="home-manager.json"')
      .send({
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        data: db.snapshot(),
      }),
  );
  app.get("/api/export/csv/:entity", async (request, reply) => {
    const { entity } = z
      .object({
        entity: z.enum(Object.keys(entities) as [string, ...string[]]),
      })
      .parse(request.params);
    return reply
      .type("text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${entity}.csv"`)
      .send(
        csv(db.list(entity), [
          "id",
          ...Object.keys(entities[entity].fields),
          "created_at",
          "updated_at",
          "revision",
        ]),
      );
  });
  app.get("/api/export/pdf/:scope", async (request, reply) => {
    const { scope } = z
      .object({
        scope: z.enum([
          "all",
          "missing-documents",
          "open-obligations",
          "completed-tasks",
          ...Object.keys(entities),
        ] as [string, ...string[]]),
      })
      .parse(request.params);
    const pdf = pdfReport(service, scope);
    reply
      .type("application/pdf")
      .header(
        "Content-Disposition",
        `attachment; filename="report-${scope}.pdf"`,
      );
    pdf.end();
    return reply.send(pdf);
  });
  app.get("/api/export/archive", async (_request, reply) => {
    const archive = createArchive(db, false);
    reply
      .type("application/zip")
      .header(
        "Content-Disposition",
        'attachment; filename="archivio-home-manager.zip"',
      );
    void archive.finalize();
    return reply.send(archive);
  });
  app.get("/api/backup", async (_request, reply) => {
    const archive = createArchive(db);
    reply
      .type("application/zip")
      .header(
        "Content-Disposition",
        'attachment; filename="backup-home-manager.zip"',
      );
    void archive.finalize();
    return reply.send(archive);
  });
  app.get("/api/restores", async () => ({
    recoveryPoints: restores.recoveryPoints(),
    maxUploadBytes: MAX_BACKUP_BYTES,
  }));
  app.post(
    "/api/restores/preview",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request) => {
      const part = await request.file({
        limits: { fileSize: MAX_BACKUP_BYTES, files: 1, fields: 0, parts: 1 },
      });
      if (!part)
        throw new AppError(422, "Selezionare il file ZIP del backup completo");
      return restores.prepare(
        part.file,
        part.filename,
        () => part.file.truncated,
      );
    },
  );
  app.post("/api/restores/:id/confirm", async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { expectedState, confirmation } = z
      .object({
        expectedState: z.string().regex(/^[a-f0-9]{64}$/),
        confirmation: z.literal("RIPRISTINA"),
      })
      .strict()
      .parse(request.body);
    return restores.commit(id, expectedState, confirmation);
  });
  app.delete("/api/restores/:id", async (request) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    restores.cancel(id);
    return { ok: true };
  });
  app.get("/api/restores/recovery/:id/backup", async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const archive = restores.recoveryArchive(id);
    reply
      .type("application/zip")
      .header(
        "Content-Disposition",
        `attachment; filename="home-manager-prima-del-ripristino-${id}.zip"`,
      );
    void archive.finalize();
    return reply.send(archive);
  });
  app.get("/api/openapi.json", async () => ({
    openapi: "3.1.0",
    info: { title: "home manager REST API", version: APP_VERSION },
    paths: Object.fromEntries(
      Object.keys(entities).flatMap((entity) => [
        [
          `/api/entities/${entity}`,
          {
            get: {
              summary: `Elenco ${entities[entity].label}`,
              responses: { "200": { description: "Array di record" } },
            },
            post: {
              summary: "Crea",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: z.toJSONSchema(schemaFor(entity)),
                  },
                },
              },
              responses: {
                "201": { description: "Record creato" },
                "422": { description: "Validazione fallita" },
              },
            },
          },
        ],
        [
          `/api/entities/${entity}/{id}`,
          {
            put: {
              summary: "Sostituisce con controllo revisione",
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string", format: "uuid" },
                },
              ],
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["revision", "data"],
                      properties: {
                        revision: { type: "integer", minimum: 1 },
                        confirmTransition: { type: "boolean" },
                        data: z.toJSONSchema(schemaFor(entity)),
                      },
                    },
                  },
                },
              },
              responses: {
                "200": { description: "Record aggiornato" },
                "409": { description: "Revisione o transizione in conflitto" },
              },
            },
            delete: {
              summary: "Elimina con revisione e titolo esatto",
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string", format: "uuid" },
                },
              ],
              responses: {
                "200": { description: "Eliminato" },
                "409": { description: "Vincolo referenziale" },
              },
            },
          },
        ],
      ]),
    ),
  }));
  const webDir = options.webDir ?? resolve("dist/web");
  if (existsSync(webDir)) {
    await app.register(staticPlugin, {
      root: webDir,
      index: ["index.html"],
      cacheControl: false,
    });
  }
  return { app, db, service, docs, restores };
}
