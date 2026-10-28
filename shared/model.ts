import { z } from "zod";
z.config(z.locales.it());

export type Scalar = string | number | null;
export type Row = {
  id: string;
  revision: number;
  created_at: string;
  updated_at: string;
  [key: string]: Scalar;
};
export type Field = {
  label: string;
  type?: "text" | "long" | "money" | "number" | "date" | "datetime" | "email";
  required?: boolean;
  options?: string[];
  ref?: string;
  default?: Scalar;
  max?: number;
};
export type EntityDef = {
  label: string;
  singular: string;
  fields: Record<string, Field>;
  columns: string[];
  readonly?: boolean;
};
const text = (label: string, extra: Partial<Field> = {}): Field => ({
  label,
  ...extra,
});
const money = (label: string): Field => ({ label, type: "money" });
const date = (label: string): Field => ({ label, type: "date" });
const ref = (label: string, table: string, required = false): Field => ({
  label,
  ref: table,
  required,
});
const select = (label: string, options: string[], initial?: string): Field => ({
  label,
  options,
  default: initial ?? options[0],
});
const name = text("Titolo", { required: true });
const notes = text("Note", { type: "long" });
const tx = ref("Transazione", "transactions");
const evidence = ref("Documento di evidenza", "documents");
const responsible = ref("Responsabile", "people");
const confidence = select(
  "Attendibilità",
  ["confirmed", "estimated", "provisional", "unverified"],
  "unverified",
);
const taskStates = [
  "todo",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
  "cancelled",
];
const risk = select("Rischio", ["low", "medium", "high", "critical"], "medium");

export const entities: Record<string, EntityDef> = {
  operations: {
    label: "Operazione",
    singular: "operazione",
    columns: ["title", "status", "updated_at"],
    fields: {
      title: name,
      status: select("Stato", ["active", "closed", "paused"]),
      currency: text("Valuta", { default: "EUR", required: true }),
      current_liquidity: money("Liquidità attuale dopo la caparra"),
      liquidity_state: confidence,
      liquidity_date: date("Saldo liquidità riferito al"),
      reserve: money("Riserva minima desiderata"),
      notes,
    },
  },
  properties: {
    label: "Immobili",
    singular: "immobile",
    columns: ["title", "locality", "address", "energy_class"],
    fields: {
      operation_id: ref("Operazione", "operations", true),
      title: name,
      address: text("Indirizzo"),
      locality: text("Località"),
      property_type: text("Tipologia"),
      internal_area: text("Superficie utile interna (m²)", { type: "number" }),
      commercial_area: text("Superficie commerciale (m²)", { type: "number" }),
      cadastral_area: text("Superficie catastale (m²)", { type: "number" }),
      advertised_area: text("Superficie dichiarata annuncio (m²)", {
        type: "number",
      }),
      garden_area: text("Giardino (m²)", { type: "number" }),
      construction_year: text("Anno costruzione", {
        type: "number",
        max: 3000,
      }),
      energy_class: text("Classe energetica"),
      energy_document_id: ref("APE", "documents"),
      occupancy: text("Occupazione e disponibilità"),
      features: text("Pertinenze, impianti e caratteristiche", {
        type: "long",
      }),
      issues: text("Difformità, danni e problematiche", { type: "long" }),
      confidence,
      notes,
    },
  },
  cadastral_units: {
    label: "Unità catastali",
    singular: "unità catastale",
    columns: ["title", "property_id", "category", "income"],
    fields: {
      title: name,
      property_id: ref("Immobile", "properties", true),
      category: text("Categoria", { required: true }),
      sheet: text("Foglio"),
      parcel: text("Particella"),
      subaltern: text("Subalterno"),
      rooms: text("Vani", { type: "number" }),
      area: text("Superficie catastale (m²)", { type: "number" }),
      income: money("Rendita catastale"),
      confidence,
      notes,
    },
  },
  transactions: {
    label: "Transazioni",
    singular: "transazione",
    columns: ["title", "kind", "status", "agreed_price", "deed_expected"],
    fields: {
      title: name,
      operation_id: ref("Operazione", "operations", true),
      property_id: ref("Immobile", "properties", true),
      kind: select("Tipo", ["sale", "purchase"]),
      status: ref("Stato della trattativa", "transaction_states", true),
      asking_price: money("Prezzo richiesto"),
      agreed_price: money("Prezzo pattuito / riferimento in trattativa"),
      price_state: confidence,
      final_price: money("Prezzo definitivo confermato"),
      paid_deposit: money("Caparra già versata"),
      remaining_mortgage: money("Mutuo residuo verificato"),
      proposal_date: date("Accettazione proposta"),
      preliminary_date: date("Firma preliminare"),
      deed_expected: date("Rogito previsto"),
      deed_actual: date("Rogito definitivo"),
      availability_date: date("Disponibilità effettiva dei proventi"),
      availability_verified: select("Modalità di disponibilità verificate", [
        "no",
        "yes",
      ]),
      funding_notes: text(
        "Modalità e ordine dei trasferimenti concordati con banca/notaio",
        { type: "long" },
      ),
      notes,
    },
  },
  transaction_states: {
    label: "Stati transazione",
    singular: "stato",
    columns: ["title", "rank", "terminal"],
    fields: {
      title: name,
      rank: text("Ordine", { type: "number", required: true }),
      terminal: select("Stato finale", ["no", "yes"]),
      notes,
    },
  },
  transaction_dependencies: {
    label: "Dipendenze transazioni",
    singular: "dipendenza",
    columns: ["title", "transaction_id", "prerequisite_id", "status"],
    fields: {
      title: name,
      transaction_id: ref("Transazione dipendente", "transactions", true),
      prerequisite_id: ref("Transazione prerequisito", "transactions", true),
      status: select("Verifica dipendenza", [
        "unverified",
        "blocked",
        "verified",
      ]),
      evidence_id: evidence,
      notes,
    },
  },
  organizations: {
    label: "Organizzazioni",
    singular: "organizzazione",
    columns: ["title", "kind", "email", "phone"],
    fields: {
      title: name,
      kind: text("Tipo"),
      email: text("Email", { type: "email" }),
      phone: text("Telefono"),
      address: text("Indirizzo"),
      notes,
    },
  },
  people: {
    label: "Contatti",
    singular: "contatto",
    columns: ["title", "role", "organization_id", "phone", "next_action"],
    fields: {
      title: text("Nome e cognome", { required: true }),
      role: text("Ruolo"),
      organization_id: ref("Organizzazione", "organizations"),
      email: text("Email", { type: "email" }),
      phone: text("Telefono"),
      last_contact: date("Ultimo contatto"),
      next_action: text("Prossima azione"),
      notes,
    },
  },
  transaction_parties: {
    label: "Parti e professionisti",
    singular: "parte",
    columns: ["title", "transaction_id", "person_id", "role"],
    fields: {
      title: name,
      transaction_id: ref("Transazione", "transactions", true),
      person_id: ref("Persona", "people"),
      organization_id: ref("Organizzazione", "organizations"),
      role: text("Ruolo", { required: true }),
      notes,
    },
  },
  documents: {
    label: "Documenti",
    singular: "documento",
    columns: ["title", "category", "status", "transaction_id", "expires_at"],
    fields: {
      title: name,
      operation_id: ref("Operazione", "operations", true),
      category: text("Categoria", { required: true }),
      description: text("Descrizione", { type: "long" }),
      status: select(
        "Stato",
        [
          "to_request",
          "requested",
          "received",
          "unverified",
          "verified",
          "replaced",
          "archived",
        ],
        "to_request",
      ),
      document_date: date("Data documento"),
      expires_at: date("Scadenza"),
      transaction_id: tx,
      property_id: ref("Immobile", "properties"),
      issuer_id: ref("Emittente", "people"),
      organization_id: ref("Organizzazione", "organizations"),
      notes,
    },
  },
  contracts: {
    label: "Contratti",
    singular: "contratto",
    columns: ["title", "transaction_id", "signature_status", "signed_at"],
    fields: {
      title: name,
      transaction_id: ref("Transazione", "transactions", true),
      kind: text("Tipo di contratto"),
      document_id: evidence,
      document_version_id: ref("Versione firmata", "document_versions"),
      signature_status: select(
        "Firma",
        ["draft", "partial", "signed"],
        "draft",
      ),
      drafted_at: date("Data redazione"),
      signed_at: date("Data firma"),
      effective_at: date("Data efficacia"),
      notes,
    },
  },
  contract_clauses: {
    label: "Clausole",
    singular: "clausola",
    columns: ["title", "contract_id", "article", "review_status"],
    fields: {
      title: name,
      contract_id: ref("Contratto", "contracts", true),
      article: text("Articolo / riferimento"),
      reference_text: text("Estratto testuale", { type: "long" }),
      activation_condition: text("Condizione di attivazione", { type: "long" }),
      review_status: select("Verifica professionale", [
        "unverified",
        "requested",
        "verified",
      ]),
      notes,
    },
  },
  obligations: {
    label: "Obblighi e condizioni",
    singular: "obbligo",
    columns: ["title", "transaction_id", "status", "due_date", "risk"],
    fields: {
      title: name,
      transaction_id: ref("Transazione", "transactions", true),
      clause_id: ref("Clausola", "contract_clauses"),
      obligated_id: ref("Soggetto obbligato", "people"),
      beneficiary_id: ref("Beneficiario", "people"),
      action: text("Azione richiesta", { type: "long" }),
      activation_condition: text("Condizione di attivazione"),
      due_date: date("Termine contrattuale"),
      evidence_required: select("Prova richiesta", ["yes", "no"], "yes"),
      evidence_id: evidence,
      status: select(
        "Adempimento",
        [
          "unverified",
          "pending",
          "in_progress",
          "blocked",
          "fulfilled",
          "waived",
        ],
        "unverified",
      ),
      risk,
      notes,
    },
  },
  tasks: {
    label: "Attività",
    singular: "attività",
    columns: [
      "title",
      "transaction_id",
      "status",
      "due_date",
      "priority",
      "responsible_id",
    ],
    fields: {
      title: name,
      operation_id: ref("Operazione", "operations", true),
      transaction_id: tx,
      description: text("Descrizione", { type: "long" }),
      category: text("Categoria"),
      responsible_id: responsible,
      due_date: date("Scadenza interna"),
      status: select("Stato", taskStates),
      priority: select(
        "Priorità",
        ["low", "normal", "high", "urgent"],
        "normal",
      ),
      risk,
      recurrence: select("Ripetizione promemoria", [
        "none",
        "weekly",
        "monthly",
      ]),
      evidence_id: evidence,
      notes,
    },
  },
  task_dependencies: {
    label: "Dipendenze attività",
    singular: "dipendenza",
    columns: ["title", "task_id", "prerequisite_id"],
    fields: {
      title: name,
      task_id: ref("Attività dipendente", "tasks", true),
      prerequisite_id: ref("Attività prerequisito", "tasks", true),
      notes,
    },
  },
  task_items: {
    label: "Checklist attività",
    singular: "voce",
    columns: ["title", "task_id", "status"],
    fields: {
      title: name,
      task_id: ref("Attività", "tasks", true),
      status: select("Stato", ["todo", "completed"]),
      evidence_id: evidence,
      notes,
    },
  },
  deadlines: {
    label: "Scadenze contrattuali",
    singular: "scadenza",
    columns: ["title", "due_date", "status", "transaction_id"],
    fields: {
      title: name,
      transaction_id: ref("Transazione", "transactions", true),
      clause_id: ref("Clausola", "contract_clauses"),
      due_date: { ...date("Data contrattuale"), required: true },
      status: select("Stato", ["open", "satisfied", "waived"]),
      responsible_id: responsible,
      evidence_id: evidence,
      reminder_days: text("Preavviso (giorni)", {
        type: "number",
        default: 14,
        max: 365,
      }),
      notes,
    },
  },
  appointments: {
    label: "Appuntamenti",
    singular: "appuntamento",
    columns: ["title", "starts_at", "person_id", "location"],
    fields: {
      title: name,
      operation_id: ref("Operazione", "operations", true),
      transaction_id: tx,
      starts_at: text("Inizio", { type: "datetime", required: true }),
      ends_at: text("Fine", { type: "datetime" }),
      person_id: ref("Interlocutore", "people"),
      location: text("Luogo"),
      notes,
    },
  },
  mortgages: {
    label: "Pratiche mutuo",
    singular: "pratica",
    columns: [
      "title",
      "bank_id",
      "requested_amount",
      "status",
      "disbursement_date",
    ],
    fields: {
      title: name,
      transaction_id: ref("Transazione", "transactions", true),
      bank_id: ref("Banca", "organizations"),
      contact_id: ref("Referente", "people"),
      requested_amount: money("Importo richiesto"),
      approved_amount: money("Importo deliberato"),
      disbursed_amount: money("Importo effettivamente erogato"),
      years: text("Durata (anni)", { type: "number", default: 25, max: 50 }),
      rate_type: select("Tasso", ["fixed", "variable"]),
      tan: text("TAN (%)", { type: "number", max: 100 }),
      taeg: text("TAEG (%)", { type: "number", max: 100 }),
      bank_payment: money("Rata comunicata dalla banca"),
      fees: money("Spese accessorie"),
      status: select("Stato", [
        "to_evaluate",
        "collecting",
        "requested",
        "under_review",
        "valuation_pending",
        "awaiting_approval",
        "approved",
        "to_sign",
        "disbursed",
        "refused",
        "withdrawn",
      ]),
      requested_date: date("Richiesta"),
      valuation_date: date("Perizia"),
      approval_date: date("Delibera"),
      disbursement_date: date("Erogazione prevista / effettiva"),
      conditions: text("Condizioni da soddisfare", { type: "long" }),
      notes,
    },
  },
  mortgage_offers: {
    label: "Offerte bancarie",
    singular: "offerta",
    columns: ["title", "bank_id", "amount", "tan", "taeg", "years"],
    fields: {
      title: name,
      mortgage_id: ref("Pratica", "mortgages"),
      bank_id: ref("Banca", "organizations"),
      amount: money("Importo"),
      years: text("Durata (anni)", { type: "number", default: 25, max: 50 }),
      tan: text("TAN (%)", { type: "number", max: 100 }),
      taeg: text("TAEG (%)", { type: "number", max: 100 }),
      fees: money("Spese"),
      bank_payment: money("Rata banca"),
      valid_until: date("Validità offerta"),
      document_id: evidence,
      notes,
    },
  },
  movements: {
    label: "Movimenti finanziari",
    singular: "movimento",
    columns: ["title", "direction", "amount", "status", "expected_date"],
    fields: {
      title: name,
      operation_id: ref("Operazione", "operations", true),
      transaction_id: tx,
      direction: select("Direzione", ["out", "in"]),
      amount: { ...money("Importo previsto"), required: true },
      actual_amount: money("Importo effettivo"),
      category: select("Categoria", [
        "deposit",
        "purchase_balance",
        "sale_proceeds",
        "mortgage_payoff",
        "mortgage_disbursement",
        "tax",
        "notary",
        "bank",
        "agency",
        "technical",
        "moving",
        "works",
        "furniture",
        "extraordinary",
        "other",
      ]),
      expected_date: date("Data prevista"),
      actual_date: date("Data effettiva"),
      availability_date: date("Data effettiva disponibilità fondi"),
      status: select("Stato", [
        "estimated",
        "expected",
        "committed",
        "paid",
        "received",
      ]),
      confidence,
      person_id: ref("Controparte", "people"),
      document_id: evidence,
      notes,
    },
  },
  scenarios: {
    label: "Scenari finanziari",
    singular: "scenario",
    columns: ["title", "sale_price", "costs", "liquidity", "new_mortgage"],
    fields: {
      title: name,
      operation_id: ref("Operazione", "operations", true),
      sale_price: { ...money("Ipotesi prezzo vendita"), required: true },
      mortgage_payoff: {
        ...money("Ipotesi estinzione residuo"),
        required: true,
      },
      costs: {
        ...money("Costi futuri complessivi, lavori inclusi"),
        required: true,
      },
      liquidity: { ...money("Ipotesi liquidità dopo caparra"), required: true },
      reserve: { ...money("Riserva desiderata"), required: true },
      new_mortgage: money("Nuovo mutuo ipotizzato (vuoto = fabbisogno)"),
      extraordinary_verified: money(
        "Entrate straordinarie verificate per lo scenario",
      ),
      years: text("Durata (anni)", {
        type: "number",
        default: 25,
        required: true,
        max: 50,
      }),
      tan: text("TAN ipotizzato (%)", {
        type: "number",
        required: true,
        max: 100,
      }),
      assumptions: text("Ipotesi e disponibilità da verificare", {
        type: "long",
        required: true,
      }),
    },
  },
  suppliers: {
    label: "Fornitori",
    singular: "fornitore",
    columns: ["title", "organization_id", "trade", "person_id"],
    fields: {
      title: name,
      organization_id: ref("Organizzazione", "organizations"),
      person_id: ref("Referente", "people"),
      trade: text("Specializzazione"),
      notes,
    },
  },
  works: {
    label: "Lavori",
    singular: "intervento",
    columns: ["title", "status", "supplier_id", "budget", "end_date"],
    fields: {
      title: name,
      transaction_id: tx,
      property_id: ref("Immobile", "properties", true),
      supplier_id: ref("Fornitore scelto", "suppliers"),
      status: select("Stato", [
        "to_evaluate",
        "quoted",
        "approved",
        "in_progress",
        "completed",
        "cancelled",
      ]),
      budget: money("Costo previsto"),
      final_cost: money("Costo definitivo"),
      start_date: date("Inizio"),
      end_date: date("Fine"),
      task_id: ref("Attività e relative dipendenze", "tasks"),
      selection_reason: text("Motivazione scelta preventivo", { type: "long" }),
      warranty_document_id: ref(
        "Garanzie e documentazione finale",
        "documents",
      ),
      notes,
    },
  },
  estimates: {
    label: "Preventivi",
    singular: "preventivo",
    columns: ["title", "work_id", "supplier_id", "amount", "status"],
    fields: {
      title: name,
      work_id: ref("Intervento", "works", true),
      supplier_id: ref("Fornitore", "suppliers"),
      amount: { ...money("Importo totale"), required: true },
      status: select("Stato", [
        "requested",
        "received",
        "selected",
        "rejected",
      ]),
      valid_until: date("Validità"),
      document_id: evidence,
      notes,
    },
  },
  communications: {
    label: "Comunicazioni",
    singular: "comunicazione",
    columns: ["title", "kind", "occurred_at", "person_id", "status"],
    fields: {
      title: name,
      operation_id: ref("Operazione", "operations", true),
      transaction_id: tx,
      person_id: ref("Interlocutore", "people"),
      kind: select("Canale", ["call", "email", "message", "meeting", "note"]),
      occurred_at: text("Data e ora", { type: "datetime", required: true }),
      content: text("Contenuto, impegni e richieste", {
        type: "long",
        required: true,
      }),
      status: select("Richiesta", ["open", "waiting", "closed"]),
      contract_id: ref("Contratto", "contracts"),
      task_id: ref("Attività", "tasks"),
      document_id: evidence,
      notes,
    },
  },
  decisions: {
    label: "Decisioni",
    singular: "decisione",
    columns: ["title", "status", "decision_date", "transaction_id"],
    fields: {
      title: name,
      operation_id: ref("Operazione", "operations", true),
      transaction_id: tx,
      person_id: ref("Persona", "people"),
      status: select("Conferma", [
        "proposed",
        "to_confirm",
        "confirmed",
        "rejected",
      ]),
      decision_date: date("Data"),
      rationale: text("Decisione e motivazione", {
        type: "long",
        required: true,
      }),
      communication_id: ref("Comunicazione", "communications"),
      document_id: evidence,
      notes,
    },
  },
  checklists: {
    label: "Checklist rogito",
    singular: "checklist",
    columns: ["title", "transaction_id"],
    fields: {
      title: name,
      transaction_id: ref("Transazione", "transactions", true),
      notes,
    },
  },
  checklist_items: {
    label: "Requisiti rogito",
    singular: "requisito",
    columns: ["title", "checklist_id", "kind", "status", "due_date"],
    fields: {
      title: name,
      checklist_id: ref("Checklist", "checklists", true),
      responsible_id: responsible,
      kind: select("Tipo requisito", [
        "necessary",
        "professional_review",
        "optional",
      ]),
      status: select(
        "Stato",
        ["todo", "waiting", "unverified", "verified", "not_applicable"],
        "unverified",
      ),
      due_date: date("Scadenza"),
      evidence_id: evidence,
      source: text("Fonte informazione"),
      depends_on_id: ref("Requisito prerequisito", "checklist_items"),
      notes,
    },
  },
  document_links: {
    label: "Collegamenti documenti",
    singular: "collegamento",
    columns: ["title", "document_id", "task_id", "obligation_id"],
    fields: {
      title: name,
      document_id: ref("Documento", "documents", true),
      task_id: ref("Attività", "tasks"),
      obligation_id: ref("Obbligo", "obligations"),
      clause_id: ref("Clausola", "contract_clauses"),
      movement_id: ref("Pagamento", "movements"),
      deadline_id: ref("Scadenza", "deadlines"),
      work_id: ref("Lavoro", "works"),
      notes,
    },
  },
  settings: {
    label: "Impostazioni",
    singular: "impostazione",
    columns: ["title", "value"],
    fields: { title: name, value: text("Valore", { required: true }), notes },
  },
};

export const labels: Record<string, string> = {
  confirmed: "Confermato",
  estimated: "Stimato",
  provisional: "Provvisorio",
  unverified: "Da verificare",
  active: "In corso",
  closed: "Chiuso",
  paused: "In pausa",
  sale: "Vendita",
  purchase: "Acquisto",
  no: "No",
  yes: "Sì",
  todo: "Da fare",
  in_progress: "In corso",
  waiting: "In attesa di terzi",
  blocked: "Bloccato",
  completed: "Completato",
  cancelled: "Annullato",
  low: "Basso",
  medium: "Medio",
  high: "Alto",
  critical: "Critico",
  normal: "Normale",
  urgent: "Urgente",
  to_request: "Da richiedere",
  requested: "Richiesto",
  received: "Ricevuto / incassato",
  verified: "Verificato",
  replaced: "Sostituito",
  archived: "Archiviato",
  draft: "Bozza",
  partial: "Firma parziale",
  signed: "Firmato",
  pending: "Da adempiere",
  fulfilled: "Adempiuto",
  waived: "Derogato",
  none: "Nessuna",
  weekly: "Settimanale",
  monthly: "Mensile",
  open: "Aperto",
  satisfied: "Soddisfatto",
  fixed: "Fisso",
  variable: "Variabile",
  to_evaluate: "Da valutare",
  collecting: "Documenti da raccogliere",
  under_review: "In istruttoria",
  valuation_pending: "Perizia da effettuare",
  awaiting_approval: "In attesa di delibera",
  approved: "Approvato",
  to_sign: "Da stipulare",
  disbursed: "Erogato",
  refused: "Rifiutato",
  withdrawn: "Ritirato",
  out: "Uscita",
  in: "Entrata",
  expected: "Previsto",
  committed: "Impegnato",
  paid: "Pagato",
  deposit: "Caparra",
  purchase_balance: "Saldo acquisto",
  sale_proceeds: "Ricavo vendita lordo",
  mortgage_payoff: "Estinzione mutuo",
  mortgage_disbursement: "Erogazione mutuo",
  tax: "Imposte",
  notary: "Notaio",
  bank: "Banca",
  agency: "Agenzia",
  technical: "Tecnici",
  moving: "Trasloco",
  works: "Lavori",
  furniture: "Arredi",
  extraordinary: "Straordinaria",
  other: "Altro",
  quoted: "Preventivato",
  selected: "Scelto",
  rejected: "Rifiutato",
  call: "Telefonata",
  email: "Email",
  message: "Messaggio",
  meeting: "Incontro",
  note: "Nota",
  proposed: "Proposta",
  to_confirm: "Da confermare",
  necessary: "Necessario",
  professional_review: "Verifica professionista",
  optional: "Facoltativo",
  not_applicable: "Non applicabile",
};

export function schemaFor(entity: string) {
  const def = entities[entity];
  if (!def) throw new Error("Entità sconosciuta");
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(def.fields)) {
    let value: z.ZodType;
    if (field.ref) value = z.string().uuid();
    else if (field.options)
      value = z.enum(field.options as [string, ...string[]]);
    else if (field.type === "money")
      value = z.number().int().min(0).max(1_000_000_000_000);
    else if (field.type === "number")
      value = z
        .number()
        .min(0)
        .max(field.max ?? 1_000_000_000);
    else if (field.type === "date") value = z.iso.date();
    else if (field.type === "datetime")
      value = z.iso.datetime({ offset: true });
    else if (field.type === "email") value = z.email().max(254);
    else
      value = z
        .string()
        .trim()
        .min(field.required ? 1 : 0)
        .max(field.type === "long" ? 20000 : 1000);
    shape[key] = field.required ? value : value.nullable().optional();
  }
  return z.object(shape).strict();
}

export const moneyFormat = (cents: Scalar | undefined) =>
  typeof cents === "number"
    ? new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
      }).format(cents / 100)
    : "Da verificare";

export function monthlyPayment(
  principalCents: number,
  tan: number,
  years: number,
) {
  if (
    !Number.isSafeInteger(principalCents) ||
    principalCents < 0 ||
    !Number.isFinite(tan) ||
    tan < 0 ||
    !Number.isInteger(years) ||
    years < 1 ||
    years > 50
  )
    throw new Error("Parametri mutuo non validi");
  const n = years * 12;
  if (tan === 0) return Math.round(principalCents / n);
  const r = tan / 1200;
  return Math.round((principalCents * r) / -Math.expm1(-n * Math.log1p(r)));
}

export function calculateScenario(purchase: Row, scenario: Row) {
  const price = purchase.final_price ?? purchase.agreed_price;
  if (typeof price !== "number") throw new Error("Prezzo acquisto mancante");
  const num = (k: string) =>
    typeof scenario[k] === "number" ? (scenario[k] as number) : 0;
  const balance = price - (Number(purchase.paid_deposit) || 0);
  if (balance < 0) throw new Error("La caparra supera il prezzo");
  const netSale = num("sale_price") - num("mortgage_payoff");
  const fundingGap = Math.max(
    0,
    balance +
      num("costs") +
      num("reserve") -
      netSale -
      num("liquidity") -
      num("extraordinary_verified"),
  );
  const mortgage =
    typeof scenario.new_mortgage === "number"
      ? scenario.new_mortgage
      : fundingGap;
  const residual =
    num("liquidity") +
    netSale +
    mortgage +
    num("extraordinary_verified") -
    balance -
    num("costs");
  return {
    balance,
    netSale,
    fundingGap,
    mortgage,
    residual,
    reserveMargin: residual - num("reserve"),
    monthlyPayment: monthlyPayment(mortgage, num("tan"), num("years")),
    totalFutureNeed: balance + num("costs"),
  };
}

export function localToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-${parts.find((p) => p.type === "day")!.value}`;
}
