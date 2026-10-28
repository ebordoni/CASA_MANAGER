import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../server/app.js";

test("le nuove installazioni sono neutre e un riavvio non importa la fixture dimostrativa", async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "home-manager-neutral-"));
  const first = await buildApp({ dataDir: root });
  let snapshot: ReturnType<typeof first.db.snapshot>;
  try {
    snapshot = first.db.snapshot();
    assert.equal(snapshot.operations.length, 1);
    assert.equal(snapshot.operations[0].title, "La mia operazione");
    assert.equal(snapshot.operations[0].current_liquidity, null);
    for (const table of [
      "people",
      "properties",
      "transactions",
      "documents",
      "scenarios",
      "deadlines",
      "tasks",
    ])
      assert.equal(snapshot[table].length, 0, table);
  } finally {
    await first.app.close();
  }
  const second = await buildApp({
    dataDir: root,
    initialDataFile: fileURLToPath(
      new URL("./fixtures/demo-data.json", import.meta.url),
    ),
  });
  t.after(async () => {
    await second.app.close();
    rmSync(root, { recursive: true, force: true });
  });
  assert.deepEqual(second.db.snapshot(), snapshot);
});

function publicationFixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(resolve(tmpdir(), "home-manager-public-check-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  writeFileSync(
    resolve(root, "initial-data.json"),
    readFileSync(new URL("../initial-data.json", import.meta.url)),
  );
  const run = () =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../scripts/check-public.mjs", import.meta.url))],
      { cwd: root, encoding: "utf8" },
    );
  return { root, run };
}

test("il controllo pubblico accetta un progetto neutro e rifiuta database e contatti privati", (t) => {
  const f = publicationFixture(t);
  assert.equal(f.run().status, 0);
  mkdirSync(resolve(f.root, "data"));
  writeFileSync(resolve(f.root, "data", "family.sqlite"), "database simulato");
  writeFileSync(
    resolve(f.root, "contact.txt"),
    "person" + "@" + "organization.demo",
  );
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /data\/family.sqlite/);
  assert.match(result.stderr, /contact.txt/);
});

test("il controllo pubblico rifiuta un’importazione operativa nella configurazione distribuita", (t) => {
  const f = publicationFixture(t);
  const initial = JSON.parse(
    readFileSync(resolve(f.root, "initial-data.json"), "utf8"),
  );
  initial.records.push({
    key: "people-1",
    entity: "people",
    data: { title: "Persona sintetica" },
  });
  writeFileSync(resolve(f.root, "initial-data.json"), JSON.stringify(initial));
  assert.equal(f.run().status, 1);
});
