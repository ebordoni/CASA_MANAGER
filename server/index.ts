import { buildApp } from "./app.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const host = process.env.HOST ?? "127.0.0.1";
const ingressOnly = process.env.INGRESS_ONLY === "true";
const password = process.env.APP_PASSWORD;
const dataDir = process.env.DATA_DIR ?? "./data";
const optionsFile = resolve(dataDir, "options.json");
if (ingressOnly && existsSync(optionsFile)) {
  const options = JSON.parse(readFileSync(optionsFile, "utf8")) as {
    log_level?: string;
  };
  if (
    options.log_level &&
    ["debug", "info", "warn", "error", "fatal"].includes(options.log_level)
  )
    process.env.LOG_LEVEL = options.log_level;
}
if (
  !ingressOnly &&
  !["127.0.0.1", "localhost", "::1"].includes(host) &&
  (!password || password.length < 16)
)
  throw new Error(
    "APP_PASSWORD di almeno 16 caratteri richiesta per ascoltare in rete",
  );
const { app } = await buildApp({
  dataDir,
  password,
  ingressOnly,
  logger: true,
  cookieSecure: process.env.COOKIE_SECURE === "true",
});
await app.listen({ host, port: Number(process.env.PORT ?? 3088) });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
