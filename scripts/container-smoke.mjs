import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const containerName = `home-manager-smoke-${randomUUID()}`;
const volumeName = `home-manager-smoke-data-${randomUUID()}`;
const appVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const image =
  process.env.HOME_MANAGER_IMAGE ??
  process.env.CASA_IMAGE ??
  `home-manager:${appVersion}`;
const env = { ...process.env, APP_PASSWORD: randomBytes(24).toString("hex") };
const docker = (...args) =>
  execFileSync("docker", args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const start = () =>
  docker(
    "run",
    "-d",
    "--name",
    containerName,
    "--publish",
    "127.0.0.1::8104",
    "--mount",
    `type=volume,source=${volumeName},target=/data`,
    "--env",
    "APP_PASSWORD",
    image,
  );
async function connect() {
  const port = docker("port", containerName, "8104/tcp").split(":").at(-1);
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Container health check did not become ready");
  assert.equal((await fetch(`${base}/api/bootstrap`)).status, 401);
  assert.equal((await fetch(`${base}/%61pi/bootstrap`)).status, 401);
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: env.APP_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  return { base, headers: { cookie, "Content-Type": "application/json" } };
}
try {
  docker("volume", "create", volumeName);
  start();
  let client = await connect();
  const created = await fetch(`${client.base}/api/entities/people`, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ title: "Persistenza container - prova automatica" }),
  });
  assert.equal(created.status, 201);
  const person = await created.json();
  docker("rm", "-f", containerName);
  start();
  client = await connect();
  const result = await fetch(`${client.base}/api/entities/people`, {
    headers: client.headers,
  });
  assert.equal(result.status, 200);
  assert.ok((await result.json()).some((row) => row.id === person.id));
  const backup = await fetch(`${client.base}/api/backup`, {
    headers: client.headers,
  });
  assert.equal(backup.status, 200);
  const zip = await backup.blob();
  const extra = await fetch(`${client.base}/api/entities/people`, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({
      title: "Contatto successivo al backup - prova automatica",
    }),
  });
  assert.equal(extra.status, 201);
  const extraPerson = await extra.json();
  const form = new FormData();
  form.append("file", zip, "backup-container.zip");
  const verified = await fetch(`${client.base}/api/restores/preview`, {
    method: "POST",
    headers: { cookie: client.headers.cookie },
    body: form,
  });
  assert.equal(verified.status, 200, await verified.clone().text());
  const preview = await verified.json();
  const restored = await fetch(
    `${client.base}/api/restores/${preview.id}/confirm`,
    {
      method: "POST",
      headers: client.headers,
      body: JSON.stringify({
        expectedState: preview.expectedState,
        confirmation: "RIPRISTINA",
      }),
    },
  );
  assert.equal(restored.status, 200, await restored.clone().text());
  const active = await restored.json();
  assert.notEqual(active.generation, "legacy");
  docker("rm", "-f", containerName);
  start();
  client = await connect();
  const bootstrap = await fetch(`${client.base}/api/bootstrap`, {
    headers: client.headers,
  });
  assert.equal(bootstrap.status, 200);
  assert.equal((await bootstrap.json()).generation, active.generation);
  const people = await (
    await fetch(`${client.base}/api/entities/people`, {
      headers: client.headers,
    })
  ).json();
  assert.ok(people.some((row) => row.id === person.id));
  assert.ok(!people.some((row) => row.id === extraPerson.id));
  const history = await (
    await fetch(`${client.base}/api/restores`, { headers: client.headers })
  ).json();
  assert.equal(history.recoveryPoints[0].id, active.recoveryPointId);
  const recovery = await fetch(
    `${client.base}/api/restores/recovery/${active.recoveryPointId}/backup`,
    { headers: client.headers },
  );
  assert.equal(recovery.status, 200);
  assert.ok((await recovery.arrayBuffer()).byteLength > 0);
  console.log(
    "Docker smoke passed: health, login, encoded-path guard, persistence, backup restore and recovery archive after container recreation.",
  );
} finally {
  try {
    docker("rm", "-f", containerName);
  } catch {}
  docker("volume", "rm", volumeName);
}
