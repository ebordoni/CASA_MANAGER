import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  ),
];
const problems = [];
const forbiddenPath =
  /(^|\/)(data|backups|dist|node_modules|\.local|private|uploads|documents)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:sqlite(?:-\w+)?|db(?:-\w+)?|zip|bundle|key|pem)$|\.(?:private|local)\.json$/i;
const secret =
  /(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const privatePath =
  /[A-Za-z]:[\\/]Users[\\/][^\s"'<>]+|\/Users\/[^\s/"'<>]+|\/home\/[^\s/"'<>]+/;
const email = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const exampleEmail = /@(?:[^@]+\.)?(?:example\.(?:com|org|net)|test|invalid)$/i;
for (const file of files) {
  if (file !== ".env.example" && forbiddenPath.test(file)) {
    problems.push(`${file}: file privato o generato incluso nel repository`);
    continue;
  }
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  const content = bytes.toString("utf8");
  if (secret.test(content)) problems.push(`${file}: possibile credenziale`);
  if (privatePath.test(content))
    problems.push(`${file}: percorso utente locale`);
  // Registry metadata can quote public third-party maintainer contacts.
  if (
    file !== "package-lock.json" &&
    [...content.matchAll(email)].some(([value]) => !exampleEmail.test(value))
  )
    problems.push(`${file}: indirizzo email da rimuovere o riesaminare`);
}
const initial = JSON.parse(readFileSync("initial-data.json", "utf8"));
const neutralEntities = new Set([
  "operations",
  "transaction_states",
  "settings",
]);
if (initial.records.some((record) => !neutralEntities.has(record.entity)))
  problems.push(
    "initial-data.json: la configurazione pubblica deve contenere solo operazione, stati e impostazioni neutre",
  );
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Public-source checks passed (${files.length} files). Review prose and images manually before publication.`,
  );
