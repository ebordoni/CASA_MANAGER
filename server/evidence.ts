import type { Database } from "./database.js";

export function invalidateChecklistDependents(db: Database, actor = "family") {
  let changed: boolean;
  do {
    changed = false;
    for (const item of db
      .list("checklist_items")
      .filter((i) => i.status === "verified" && i.depends_on_id)) {
      if (
        db.get("checklist_items", String(item.depends_on_id))?.status !==
        "verified"
      ) {
        db.update(
          "checklist_items",
          item.id,
          {
            status: "unverified",
            notes: `${item.notes ?? ""}\nPrerequisito non più verificato: riesaminare.`,
          },
          item.revision,
          actor,
        );
        changed = true;
      }
    }
  } while (changed);
}

export function invalidateEvidence(
  db: Database,
  documentId: string,
  reason: string,
  actor = "family",
) {
  for (const [entity, completed, reset] of [
    ["obligations", "fulfilled", "unverified"],
    ["checklist_items", "verified", "unverified"],
    ["deadlines", "satisfied", "open"],
    ["transaction_dependencies", "verified", "unverified"],
  ] as const) {
    for (const row of db
      .list(entity)
      .filter((r) => r.evidence_id === documentId && r.status === completed))
      db.update(
        entity,
        row.id,
        { status: reset, notes: `${row.notes ?? ""}\n${reason}` },
        row.revision,
        actor,
      );
  }
  invalidateChecklistDependents(db, actor);
}
