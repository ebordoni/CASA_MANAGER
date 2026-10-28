import {
  entities,
  schemaFor,
  type Row,
  type Scalar,
  calculateScenario,
  localToday,
} from "../shared/model.js";
import { AppError, Database } from "./database.js";
import {
  invalidateChecklistDependents,
  invalidateEvidence,
} from "./evidence.js";

export class Service {
  constructor(public db: Database) {}
  save(
    entity: string,
    input: unknown,
    id?: string,
    revision?: number,
    confirmTransition = false,
    actor = "family",
  ) {
    if (!entities[entity]) throw new AppError(404, "Entità sconosciuta");
    const data = schemaFor(entity).parse(input) as Record<string, Scalar>;
    // Fill absent optional fields explicitly. PUT is a full replacement, not a patch.
    for (const [key, field] of Object.entries(entities[entity].fields))
      if (data[key] === undefined) data[key] = field.default ?? null;
    const before = id ? this.db.get(entity, id) : undefined;
    if (id && !before) throw new AppError(404, "Elemento non trovato");
    const row = { ...before, ...data } as Row;
    return this.db.atomic(() => {
      this.validate(entity, row, before, confirmTransition);
      const saved = id
        ? this.db.update(entity, id, data, revision!, actor)
        : this.db.insert(entity, data, actor);
      if (
        entity === "documents" &&
        before?.status === "verified" &&
        saved.status !== "verified"
      )
        invalidateEvidence(
          this.db,
          saved.id,
          "La prova non è più verificata: riesaminare.",
          actor,
        );
      if (entity === "checklist_items" && saved.status !== "verified")
        invalidateChecklistDependents(this.db, actor);
      if (
        entity === "tasks" &&
        saved.status === "completed" &&
        before?.status !== "completed" &&
        saved.recurrence !== "none" &&
        saved.due_date
      ) {
        const due = new Date(`${saved.due_date}T12:00:00Z`);
        if (saved.recurrence === "weekly") due.setUTCDate(due.getUTCDate() + 7);
        else {
          const day = due.getUTCDate();
          due.setUTCDate(1);
          due.setUTCMonth(due.getUTCMonth() + 1);
          const last = new Date(
            Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0),
          ).getUTCDate();
          due.setUTCDate(Math.min(day, last));
        }
        this.db.insert(
          "tasks",
          {
            ...data,
            status: "todo",
            evidence_id: null,
            due_date: due.toISOString().slice(0, 10),
            notes: `Ricorrenza di ${saved.title}. ${data.notes ?? ""}`,
          },
          actor,
        );
      }
      if (
        entity === "contract_clauses" &&
        before &&
        (before.reference_text !== saved.reference_text ||
          before.activation_condition !== saved.activation_condition)
      ) {
        for (const obligation of this.db
          .list("obligations")
          .filter((o) => o.clause_id === id))
          this.db.update(
            "obligations",
            obligation.id,
            {
              status: "unverified",
              notes: `${obligation.notes ?? ""}\nClausola modificata: riesaminare obbligo e termine.`,
            },
            obligation.revision,
            actor,
          );
        for (const deadline of this.db
          .list("deadlines")
          .filter((d) => d.clause_id === id))
          this.db.update(
            "deadlines",
            deadline.id,
            {
              status: "open",
              notes: `${deadline.notes ?? ""}\nClausola modificata: termine da riesaminare con il professionista.`,
            },
            deadline.revision,
            actor,
          );
      }
      return saved;
    });
  }
  validate(entity: string, row: Row, before?: Row, confirm = false) {
    const assert = (condition: unknown, message: string) => {
      if (!condition) throw new AppError(422, message);
    };
    for (const [key, field] of Object.entries(entities[entity].fields)) {
      if (field.ref && row[key])
        assert(
          this.db.get(field.ref, String(row[key])),
          `${field.label}: elemento collegato non trovato`,
        );
    }
    const verifyEvidence = (documentId: Scalar, required = true) => {
      if (!required && !documentId) return;
      assert(documentId, "È richiesto un documento di evidenza");
      const doc = this.db.get("documents", String(documentId));
      assert(
        doc?.status === "verified",
        "La prova deve essere un documento verificato manualmente",
      );
      assert(
        this.db
          .list("document_versions")
          .some((v) => v.document_id === documentId),
        "Il documento di prova non contiene un file",
      );
    };
    if (entity === "operations" && row.liquidity_state === "confirmed") {
      assert(
        typeof row.current_liquidity === "number" && row.liquidity_date,
        "Per confermare la liquidità, indicare importo esatto e data del saldo",
      );
      assert(
        String(row.liquidity_date) <= localToday(),
        "La data del saldo confermato non può essere futura",
      );
    }
    if (entity === "transactions") {
      const property = this.db.get("properties", String(row.property_id));
      assert(
        property?.operation_id === row.operation_id,
        "Immobile e transazione devono appartenere alla stessa operazione",
      );
      const price = row.final_price ?? row.agreed_price;
      assert(
        price === null || Number(row.paid_deposit ?? 0) <= Number(price),
        "La caparra non può superare il prezzo",
      );
      if (row.availability_verified === "yes")
        assert(
          row.availability_date && row.funding_notes,
          "Specificare data e modalità concordate della disponibilità dei fondi",
        );
      const state = this.db.get("transaction_states", String(row.status));
      if (state?.terminal === "yes")
        assert(
          row.deed_actual && row.final_price !== null,
          "Per chiudere servono prezzo definitivo e data del rogito",
        );
      const oldState = before
        ? this.db.get("transaction_states", String(before.status))
        : undefined;
      if (
        oldState &&
        state &&
        (Number(state.rank) < Number(oldState.rank) ||
          Number(state.rank) > Number(oldState.rank) + 1 ||
          state.terminal === "yes") &&
        !confirm
      )
        throw new AppError(
          409,
          "Transizione non ordinaria: conferma esplicitamente il cambio di stato",
        );
    }
    if (entity === "obligations" && row.status === "fulfilled")
      verifyEvidence(row.evidence_id, row.evidence_required === "yes");
    if (entity === "deadlines") {
      if (row.status === "satisfied") verifyEvidence(row.evidence_id);
      if (before && before.due_date !== row.due_date && !confirm)
        throw new AppError(
          409,
          "Modifica di un termine contrattuale: conferma dopo verifica con il professionista",
        );
    }
    if (entity === "checklist_items" && row.status === "verified") {
      verifyEvidence(row.evidence_id);
      if (row.depends_on_id)
        assert(
          this.db.get("checklist_items", String(row.depends_on_id))?.status ===
            "verified",
          "Il requisito prerequisito deve essere verificato",
        );
    }
    if (entity === "documents" && row.status === "verified")
      assert(
        before &&
          this.db
            .list("document_versions")
            .some((v) => v.document_id === before.id),
        "Caricare un file prima della verifica manuale",
      );
    if (entity === "contracts" && row.document_version_id)
      assert(
        this.db.get("document_versions", String(row.document_version_id))
          ?.document_id === row.document_id,
        "La versione deve appartenere al documento collegato",
      );
    if (entity === "appointments" && row.ends_at)
      assert(
        String(row.ends_at) >= String(row.starts_at),
        "La fine precede l’inizio",
      );
    if (entity === "mortgages" && row.status === "disbursed")
      assert(
        Number(row.disbursed_amount) > 0 && row.disbursement_date,
        "Per l’erogazione servono importo effettivo e data",
      );
    if (
      ["mortgages", "mortgage_offers", "scenarios"].includes(entity) &&
      row.years !== null
    )
      assert(
        Number.isInteger(row.years) && Number(row.years) >= 1,
        "La durata deve essere un numero intero di anni da 1 a 50",
      );
    if (entity === "movements") {
      assert(
        !(row.status === "paid" && row.direction === "in") &&
          !(row.status === "received" && row.direction === "out"),
        "Stato e direzione del movimento non coerenti",
      );
      if (["paid", "received"].includes(String(row.status)))
        assert(row.actual_date, "Indicare la data effettiva");
      if (row.actual_date)
        assert(
          String(row.actual_date) <= localToday(),
          "Una data effettiva non può essere futura",
        );
    }
    if (entity === "tasks" && row.status === "completed") {
      const dependencies = this.db
        .list("task_dependencies")
        .filter((d) => d.task_id === row.id);
      assert(
        dependencies.every(
          (d) =>
            this.db.get("tasks", String(d.prerequisite_id))?.status ===
            "completed",
        ),
        "Completare prima tutte le attività prerequisito",
      );
      assert(
        this.db
          .list("task_items")
          .filter((i) => i.task_id === row.id)
          .every((i) => i.status === "completed"),
        "Completare la checklist interna dell’attività",
      );
    }
    if (
      entity === "tasks" &&
      before?.status === "completed" &&
      row.status !== "completed"
    ) {
      const dependents = this.db
        .list("task_dependencies")
        .filter((d) => d.prerequisite_id === row.id);
      assert(
        !dependents.some(
          (d) =>
            this.db.get("tasks", String(d.task_id))?.status === "completed",
        ),
        "Riaprire prima le attività dipendenti già completate",
      );
    }
    if (entity === "checklist_items" && row.depends_on_id) {
      let next: Scalar = row.depends_on_id;
      const seen = new Set([row.id]);
      while (next) {
        assert(!seen.has(String(next)), "La dipendenza crea un ciclo");
        seen.add(String(next));
        next = this.db.get(entity, String(next))?.depends_on_id ?? null;
      }
    }
    if (
      entity === "task_dependencies" ||
      entity === "transaction_dependencies"
    ) {
      const source =
        entity === "task_dependencies" ? "task_id" : "transaction_id";
      const table = source === "task_id" ? "tasks" : "transactions";
      assert(
        row[source] !== row.prerequisite_id,
        "Un elemento non può dipendere da sé stesso",
      );
      if (
        entity === "task_dependencies" &&
        this.db.get("tasks", String(row.task_id))?.status === "completed"
      )
        assert(
          this.db.get("tasks", String(row.prerequisite_id))?.status ===
            "completed",
          "Un’attività completata non può dipendere da un prerequisito aperto",
        );
      assert(
        this.db.get(table, String(row[source]))?.operation_id ===
          this.db.get(table, String(row.prerequisite_id))?.operation_id,
        "La dipendenza deve appartenere alla stessa operazione",
      );
      const all = this.db
        .list(entity)
        .filter((d) => d.id !== row.id)
        .concat(row);
      const visit = (id: string, path: Set<string>) => {
        assert(!path.has(id), "La dipendenza crea un ciclo");
        const nextPath = new Set(path).add(id);
        for (const link of all.filter((d) => d[source] === id))
          visit(String(link.prerequisite_id), nextPath);
      };
      visit(String(row[source]), new Set());
      if (entity === "transaction_dependencies" && row.status === "verified")
        verifyEvidence(row.evidence_id);
    }
    if (entity === "transaction_parties")
      assert(
        row.person_id || row.organization_id,
        "Selezionare una persona o un’organizzazione",
      );
    if (entity === "document_links")
      assert(
        [
          "task_id",
          "obligation_id",
          "clause_id",
          "movement_id",
          "deadline_id",
          "work_id",
        ].some((k) => row[k]),
        "Collegare almeno un elemento al documento",
      );
    if (entity === "estimates" && row.status === "selected") {
      const work = this.db.get("works", String(row.work_id));
      assert(
        work?.selection_reason,
        "Registrare prima la motivazione della scelta nel lavoro",
      );
      assert(
        !this.db
          .list("estimates")
          .some(
            (e) =>
              e.id !== row.id &&
              e.work_id === row.work_id &&
              e.status === "selected",
          ),
        "Esiste già un preventivo scelto per questo intervento",
      );
    }
  }
  dashboard() {
    const data = this.db.snapshot();
    const today = localToday();
    const activeTasks = data.tasks.filter(
      (t) => !["completed", "cancelled"].includes(String(t.status)),
    );
    const deadlines = data.deadlines
      .filter((d) => d.status === "open")
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    const missingDocuments = data.documents.filter((d) =>
      ["to_request", "requested", "unverified", "received"].includes(
        String(d.status),
      ),
    );
    const readiness = data.checklists.map((c) => {
      const items = data.checklist_items.filter((i) => i.checklist_id === c.id);
      const mandatory = items.filter((i) => i.kind !== "optional");
      const verified = mandatory.filter((i) => i.status === "verified").length;
      const tx = data.transactions.find((t) => t.id === c.transaction_id);
      const obligations = data.obligations.filter(
        (o) =>
          o.transaction_id === tx?.id &&
          !["fulfilled", "waived"].includes(String(o.status)),
      );
      const dependencies = data.transaction_dependencies.filter(
        (d) => d.transaction_id === tx?.id && d.status !== "verified",
      );
      return {
        checklist: c,
        total: mandatory.length,
        verified,
        openObligations: obligations.length,
        unverifiedDependencies: dependencies.length,
        organizationalReady:
          mandatory.length > 0 &&
          verified === mandatory.length &&
          obligations.length === 0 &&
          dependencies.length === 0,
      };
    });
    return {
      today,
      activeTasks,
      overdue: activeTasks.filter(
        (t) => t.due_date && String(t.due_date) < today,
      ),
      blockers: activeTasks.filter(
        (t) =>
          t.status === "blocked" ||
          ["high", "critical"].includes(String(t.risk)),
      ),
      deadlines,
      missingDocuments,
      readiness,
      scenarios: data.scenarios.flatMap((s) => {
        const purchase = data.transactions.find(
          (t) => t.kind === "purchase" && t.operation_id === s.operation_id,
        );
        return purchase
          ? [{ scenario: s, result: calculateScenario(purchase, s) }]
          : [];
      }),
    };
  }
  cashTimeline(operationId: string) {
    const op = this.db.get("operations", operationId);
    if (!op) throw new AppError(404, "Operazione non trovata");
    const known =
      typeof op.current_liquidity === "number" &&
      op.liquidity_state === "confirmed" &&
      !!op.liquidity_date;
    let actualBalance = known ? Number(op.current_liquidity) : null;
    let projectedBalance = actualBalance;
    const excluded: Row[] = [];
    const events = this.db
      .list("movements")
      .filter((m) => m.operation_id === operationId)
      .map((m): Row => ({
        ...m,
        date:
          m.direction === "in"
            ? (m.availability_date ?? m.actual_date ?? m.expected_date)
            : (m.actual_date ?? m.expected_date),
      }))
      .filter((m) => {
        if (
          !m.date ||
          (known &&
            String(m.date) <= String(op.liquidity_date) &&
            ["paid", "received"].includes(String(m.status)))
        ) {
          excluded.push(m);
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          String(a.date).localeCompare(String(b.date)) ||
          (a.direction === b.direction
            ? a.id.localeCompare(b.id)
            : a.direction === "out"
              ? -1
              : 1),
      );
    return {
      openingKnown: known,
      opening: known ? op.current_liquidity : null,
      openingDate: op.liquidity_date,
      excluded,
      events: events.map((m) => {
        const booked = ["paid", "received"].includes(String(m.status));
        const amount = booked ? (m.actual_amount ?? m.amount) : m.amount;
        const delta = Number(amount) * (m.direction === "in" ? 1 : -1);
        const actual =
          String(m.date) <= localToday() &&
          (m.direction === "in"
            ? m.status === "received" && !!m.availability_date
            : m.status === "paid");
        if (projectedBalance !== null) projectedBalance += delta;
        if (actual && actualBalance !== null) actualBalance += delta;
        return {
          ...m,
          title: m.title,
          date: m.date,
          direction: m.direction,
          amount,
          plannedAmount: m.amount,
          variance:
            typeof m.actual_amount === "number"
              ? m.actual_amount - Number(m.amount)
              : null,
          status: m.status,
          actual,
          actualBalance,
          projectedBalance,
          sameDayOrderUnverified: events.some(
            (e) =>
              e.id !== m.id && e.date === m.date && e.direction !== m.direction,
          ),
        };
      }),
    };
  }
}
