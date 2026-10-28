-- Baseline v1. Amounts are integer EUR cents; dates ISO; no destructive cascades.
CREATE TABLE "operations" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "status" TEXT CHECK("status" IN ('active','closed','paused')),
 "currency" TEXT NOT NULL,
 "current_liquidity" INTEGER CHECK("current_liquidity" >= 0),
 "liquidity_state" TEXT CHECK("liquidity_state" IN ('confirmed','estimated','provisional','unverified')),
 "liquidity_date" TEXT ,
 "reserve" INTEGER CHECK("reserve" >= 0),
 "notes" TEXT );

CREATE TABLE "properties" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "operation_id" TEXT NOT NULL REFERENCES "operations"(id) ON DELETE RESTRICT,
 "title" TEXT NOT NULL,
 "address" TEXT ,
 "locality" TEXT ,
 "property_type" TEXT ,
 "internal_area" REAL CHECK("internal_area" >= 0),
 "commercial_area" REAL CHECK("commercial_area" >= 0),
 "cadastral_area" REAL CHECK("cadastral_area" >= 0),
 "advertised_area" REAL CHECK("advertised_area" >= 0),
 "garden_area" REAL CHECK("garden_area" >= 0),
 "construction_year" REAL CHECK("construction_year" >= 0),
 "energy_class" TEXT ,
 "energy_document_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "occupancy" TEXT ,
 "features" TEXT ,
 "issues" TEXT ,
 "confidence" TEXT CHECK("confidence" IN ('confirmed','estimated','provisional','unverified')),
 "notes" TEXT );

CREATE TABLE "cadastral_units" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "property_id" TEXT NOT NULL REFERENCES "properties"(id) ON DELETE RESTRICT,
 "category" TEXT NOT NULL,
 "sheet" TEXT ,
 "parcel" TEXT ,
 "subaltern" TEXT ,
 "rooms" REAL CHECK("rooms" >= 0),
 "area" REAL CHECK("area" >= 0),
 "income" INTEGER CHECK("income" >= 0),
 "confidence" TEXT CHECK("confidence" IN ('confirmed','estimated','provisional','unverified')),
 "notes" TEXT );

CREATE TABLE "transactions" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "operation_id" TEXT NOT NULL REFERENCES "operations"(id) ON DELETE RESTRICT,
 "property_id" TEXT NOT NULL REFERENCES "properties"(id) ON DELETE RESTRICT,
 "kind" TEXT CHECK("kind" IN ('sale','purchase')),
 "status" TEXT NOT NULL REFERENCES "transaction_states"(id) ON DELETE RESTRICT,
 "asking_price" INTEGER CHECK("asking_price" >= 0),
 "agreed_price" INTEGER CHECK("agreed_price" >= 0),
 "price_state" TEXT CHECK("price_state" IN ('confirmed','estimated','provisional','unverified')),
 "final_price" INTEGER CHECK("final_price" >= 0),
 "paid_deposit" INTEGER CHECK("paid_deposit" >= 0),
 "remaining_mortgage" INTEGER CHECK("remaining_mortgage" >= 0),
 "proposal_date" TEXT ,
 "preliminary_date" TEXT ,
 "deed_expected" TEXT ,
 "deed_actual" TEXT ,
 "availability_date" TEXT ,
 "availability_verified" TEXT CHECK("availability_verified" IN ('no','yes')),
 "funding_notes" TEXT ,
 "notes" TEXT );

CREATE TABLE "transaction_states" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "rank" REAL NOT NULL CHECK("rank" >= 0),
 "terminal" TEXT CHECK("terminal" IN ('no','yes')),
 "notes" TEXT );

CREATE TABLE "transaction_dependencies" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "transaction_id" TEXT NOT NULL REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "prerequisite_id" TEXT NOT NULL REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "status" TEXT CHECK("status" IN ('unverified','blocked','verified')),
 "evidence_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "organizations" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "kind" TEXT ,
 "email" TEXT ,
 "phone" TEXT ,
 "address" TEXT ,
 "notes" TEXT );

CREATE TABLE "people" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "role" TEXT ,
 "organization_id" TEXT REFERENCES "organizations"(id) ON DELETE RESTRICT,
 "email" TEXT ,
 "phone" TEXT ,
 "last_contact" TEXT ,
 "next_action" TEXT ,
 "notes" TEXT );

CREATE TABLE "transaction_parties" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "transaction_id" TEXT NOT NULL REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "person_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "organization_id" TEXT REFERENCES "organizations"(id) ON DELETE RESTRICT,
 "role" TEXT NOT NULL,
 "notes" TEXT );

CREATE TABLE "documents" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "operation_id" TEXT NOT NULL REFERENCES "operations"(id) ON DELETE RESTRICT,
 "category" TEXT NOT NULL,
 "description" TEXT ,
 "status" TEXT CHECK("status" IN ('to_request','requested','received','unverified','verified','replaced','archived')),
 "document_date" TEXT ,
 "expires_at" TEXT ,
 "transaction_id" TEXT REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "property_id" TEXT REFERENCES "properties"(id) ON DELETE RESTRICT,
 "issuer_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "organization_id" TEXT REFERENCES "organizations"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "contracts" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "transaction_id" TEXT NOT NULL REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "kind" TEXT ,
 "document_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "document_version_id" TEXT REFERENCES "document_versions"(id) ON DELETE RESTRICT,
 "signature_status" TEXT CHECK("signature_status" IN ('draft','partial','signed')),
 "drafted_at" TEXT ,
 "signed_at" TEXT ,
 "effective_at" TEXT ,
 "notes" TEXT );

CREATE TABLE "contract_clauses" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "contract_id" TEXT NOT NULL REFERENCES "contracts"(id) ON DELETE RESTRICT,
 "article" TEXT ,
 "reference_text" TEXT ,
 "activation_condition" TEXT ,
 "review_status" TEXT CHECK("review_status" IN ('unverified','requested','verified')),
 "notes" TEXT );

CREATE TABLE "obligations" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "transaction_id" TEXT NOT NULL REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "clause_id" TEXT REFERENCES "contract_clauses"(id) ON DELETE RESTRICT,
 "obligated_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "beneficiary_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "action" TEXT ,
 "activation_condition" TEXT ,
 "due_date" TEXT ,
 "evidence_required" TEXT CHECK("evidence_required" IN ('yes','no')),
 "evidence_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "status" TEXT CHECK("status" IN ('unverified','pending','in_progress','blocked','fulfilled','waived')),
 "risk" TEXT CHECK("risk" IN ('low','medium','high','critical')),
 "notes" TEXT );

CREATE TABLE "tasks" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "operation_id" TEXT NOT NULL REFERENCES "operations"(id) ON DELETE RESTRICT,
 "transaction_id" TEXT REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "description" TEXT ,
 "category" TEXT ,
 "responsible_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "due_date" TEXT ,
 "status" TEXT CHECK("status" IN ('todo','in_progress','waiting','blocked','completed','cancelled')),
 "priority" TEXT CHECK("priority" IN ('low','normal','high','urgent')),
 "risk" TEXT CHECK("risk" IN ('low','medium','high','critical')),
 "recurrence" TEXT CHECK("recurrence" IN ('none','weekly','monthly')),
 "evidence_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "task_dependencies" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "task_id" TEXT NOT NULL REFERENCES "tasks"(id) ON DELETE RESTRICT,
 "prerequisite_id" TEXT NOT NULL REFERENCES "tasks"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "task_items" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "task_id" TEXT NOT NULL REFERENCES "tasks"(id) ON DELETE RESTRICT,
 "status" TEXT CHECK("status" IN ('todo','completed')),
 "evidence_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "deadlines" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "transaction_id" TEXT NOT NULL REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "clause_id" TEXT REFERENCES "contract_clauses"(id) ON DELETE RESTRICT,
 "due_date" TEXT NOT NULL,
 "status" TEXT CHECK("status" IN ('open','satisfied','waived')),
 "responsible_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "evidence_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "reminder_days" REAL CHECK("reminder_days" >= 0),
 "notes" TEXT );

CREATE TABLE "appointments" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "operation_id" TEXT NOT NULL REFERENCES "operations"(id) ON DELETE RESTRICT,
 "transaction_id" TEXT REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "starts_at" TEXT NOT NULL,
 "ends_at" TEXT ,
 "person_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "location" TEXT ,
 "notes" TEXT );

CREATE TABLE "mortgages" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "transaction_id" TEXT NOT NULL REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "bank_id" TEXT REFERENCES "organizations"(id) ON DELETE RESTRICT,
 "contact_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "requested_amount" INTEGER CHECK("requested_amount" >= 0),
 "approved_amount" INTEGER CHECK("approved_amount" >= 0),
 "disbursed_amount" INTEGER CHECK("disbursed_amount" >= 0),
 "years" REAL CHECK("years" >= 0),
 "rate_type" TEXT CHECK("rate_type" IN ('fixed','variable')),
 "tan" REAL CHECK("tan" >= 0),
 "taeg" REAL CHECK("taeg" >= 0),
 "bank_payment" INTEGER CHECK("bank_payment" >= 0),
 "fees" INTEGER CHECK("fees" >= 0),
 "status" TEXT CHECK("status" IN ('to_evaluate','collecting','requested','under_review','valuation_pending','awaiting_approval','approved','to_sign','disbursed','refused','withdrawn')),
 "requested_date" TEXT ,
 "valuation_date" TEXT ,
 "approval_date" TEXT ,
 "disbursement_date" TEXT ,
 "conditions" TEXT ,
 "notes" TEXT );

CREATE TABLE "mortgage_offers" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "mortgage_id" TEXT REFERENCES "mortgages"(id) ON DELETE RESTRICT,
 "bank_id" TEXT REFERENCES "organizations"(id) ON DELETE RESTRICT,
 "amount" INTEGER CHECK("amount" >= 0),
 "years" REAL CHECK("years" >= 0),
 "tan" REAL CHECK("tan" >= 0),
 "taeg" REAL CHECK("taeg" >= 0),
 "fees" INTEGER CHECK("fees" >= 0),
 "bank_payment" INTEGER CHECK("bank_payment" >= 0),
 "valid_until" TEXT ,
 "document_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "movements" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "operation_id" TEXT NOT NULL REFERENCES "operations"(id) ON DELETE RESTRICT,
 "transaction_id" TEXT REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "direction" TEXT CHECK("direction" IN ('out','in')),
 "amount" INTEGER NOT NULL CHECK("amount" >= 0),
 "category" TEXT CHECK("category" IN ('deposit','purchase_balance','sale_proceeds','mortgage_payoff','mortgage_disbursement','tax','notary','bank','agency','technical','moving','works','furniture','extraordinary','other')),
 "expected_date" TEXT ,
 "actual_date" TEXT ,
 "availability_date" TEXT ,
 "status" TEXT CHECK("status" IN ('estimated','expected','committed','paid','received')),
 "confidence" TEXT CHECK("confidence" IN ('confirmed','estimated','provisional','unverified')),
 "person_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "document_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "scenarios" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "operation_id" TEXT NOT NULL REFERENCES "operations"(id) ON DELETE RESTRICT,
 "sale_price" INTEGER NOT NULL CHECK("sale_price" >= 0),
 "mortgage_payoff" INTEGER NOT NULL CHECK("mortgage_payoff" >= 0),
 "costs" INTEGER NOT NULL CHECK("costs" >= 0),
 "liquidity" INTEGER NOT NULL CHECK("liquidity" >= 0),
 "reserve" INTEGER NOT NULL CHECK("reserve" >= 0),
 "new_mortgage" INTEGER CHECK("new_mortgage" >= 0),
 "extraordinary_verified" INTEGER CHECK("extraordinary_verified" >= 0),
 "years" REAL NOT NULL CHECK("years" >= 0),
 "tan" REAL NOT NULL CHECK("tan" >= 0),
 "assumptions" TEXT NOT NULL);

CREATE TABLE "suppliers" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "organization_id" TEXT REFERENCES "organizations"(id) ON DELETE RESTRICT,
 "person_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "trade" TEXT ,
 "notes" TEXT );

CREATE TABLE "works" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "transaction_id" TEXT REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "property_id" TEXT NOT NULL REFERENCES "properties"(id) ON DELETE RESTRICT,
 "supplier_id" TEXT REFERENCES "suppliers"(id) ON DELETE RESTRICT,
 "status" TEXT CHECK("status" IN ('to_evaluate','quoted','approved','in_progress','completed','cancelled')),
 "budget" INTEGER CHECK("budget" >= 0),
 "final_cost" INTEGER CHECK("final_cost" >= 0),
 "start_date" TEXT ,
 "end_date" TEXT ,
 "task_id" TEXT REFERENCES "tasks"(id) ON DELETE RESTRICT,
 "selection_reason" TEXT ,
 "warranty_document_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "estimates" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "work_id" TEXT NOT NULL REFERENCES "works"(id) ON DELETE RESTRICT,
 "supplier_id" TEXT REFERENCES "suppliers"(id) ON DELETE RESTRICT,
 "amount" INTEGER NOT NULL CHECK("amount" >= 0),
 "status" TEXT CHECK("status" IN ('requested','received','selected','rejected')),
 "valid_until" TEXT ,
 "document_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "communications" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "operation_id" TEXT NOT NULL REFERENCES "operations"(id) ON DELETE RESTRICT,
 "transaction_id" TEXT REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "person_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "kind" TEXT CHECK("kind" IN ('call','email','message','meeting','note')),
 "occurred_at" TEXT NOT NULL,
 "content" TEXT NOT NULL,
 "status" TEXT CHECK("status" IN ('open','waiting','closed')),
 "contract_id" TEXT REFERENCES "contracts"(id) ON DELETE RESTRICT,
 "task_id" TEXT REFERENCES "tasks"(id) ON DELETE RESTRICT,
 "document_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "decisions" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "operation_id" TEXT NOT NULL REFERENCES "operations"(id) ON DELETE RESTRICT,
 "transaction_id" TEXT REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "person_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "status" TEXT CHECK("status" IN ('proposed','to_confirm','confirmed','rejected')),
 "decision_date" TEXT ,
 "rationale" TEXT NOT NULL,
 "communication_id" TEXT REFERENCES "communications"(id) ON DELETE RESTRICT,
 "document_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "checklists" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "transaction_id" TEXT NOT NULL REFERENCES "transactions"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "checklist_items" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "checklist_id" TEXT NOT NULL REFERENCES "checklists"(id) ON DELETE RESTRICT,
 "responsible_id" TEXT REFERENCES "people"(id) ON DELETE RESTRICT,
 "kind" TEXT CHECK("kind" IN ('necessary','professional_review','optional')),
 "status" TEXT CHECK("status" IN ('todo','waiting','unverified','verified','not_applicable')),
 "due_date" TEXT ,
 "evidence_id" TEXT REFERENCES "documents"(id) ON DELETE RESTRICT,
 "source" TEXT ,
 "depends_on_id" TEXT REFERENCES "checklist_items"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "document_links" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "document_id" TEXT NOT NULL REFERENCES "documents"(id) ON DELETE RESTRICT,
 "task_id" TEXT REFERENCES "tasks"(id) ON DELETE RESTRICT,
 "obligation_id" TEXT REFERENCES "obligations"(id) ON DELETE RESTRICT,
 "clause_id" TEXT REFERENCES "contract_clauses"(id) ON DELETE RESTRICT,
 "movement_id" TEXT REFERENCES "movements"(id) ON DELETE RESTRICT,
 "deadline_id" TEXT REFERENCES "deadlines"(id) ON DELETE RESTRICT,
 "work_id" TEXT REFERENCES "works"(id) ON DELETE RESTRICT,
 "notes" TEXT );

CREATE TABLE "settings" (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "value" TEXT NOT NULL,
 "notes" TEXT );

CREATE TABLE document_versions (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT, version INTEGER NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, hash TEXT NOT NULL UNIQUE, UNIQUE(document_id,version));

CREATE TABLE audit_events (id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, actor TEXT NOT NULL);

CREATE INDEX "idx_operations_status" ON "operations"("status");

CREATE INDEX "idx_operations_liquidity_state" ON "operations"("liquidity_state");

CREATE INDEX "idx_operations_liquidity_date" ON "operations"("liquidity_date");

CREATE INDEX "idx_properties_operation_id" ON "properties"("operation_id");

CREATE INDEX "idx_properties_energy_document_id" ON "properties"("energy_document_id");

CREATE INDEX "idx_properties_confidence" ON "properties"("confidence");

CREATE INDEX "idx_cadastral_units_property_id" ON "cadastral_units"("property_id");

CREATE INDEX "idx_cadastral_units_confidence" ON "cadastral_units"("confidence");

CREATE INDEX "idx_transactions_operation_id" ON "transactions"("operation_id");

CREATE INDEX "idx_transactions_property_id" ON "transactions"("property_id");

CREATE INDEX "idx_transactions_kind" ON "transactions"("kind");

CREATE INDEX "idx_transactions_status" ON "transactions"("status");

CREATE INDEX "idx_transactions_price_state" ON "transactions"("price_state");

CREATE INDEX "idx_transactions_proposal_date" ON "transactions"("proposal_date");

CREATE INDEX "idx_transactions_preliminary_date" ON "transactions"("preliminary_date");

CREATE INDEX "idx_transactions_deed_expected" ON "transactions"("deed_expected");

CREATE INDEX "idx_transactions_deed_actual" ON "transactions"("deed_actual");

CREATE INDEX "idx_transactions_availability_date" ON "transactions"("availability_date");

CREATE INDEX "idx_transactions_availability_verified" ON "transactions"("availability_verified");

CREATE INDEX "idx_transaction_states_terminal" ON "transaction_states"("terminal");

CREATE INDEX "idx_transaction_dependencies_transaction_id" ON "transaction_dependencies"("transaction_id");

CREATE INDEX "idx_transaction_dependencies_prerequisite_id" ON "transaction_dependencies"("prerequisite_id");

CREATE INDEX "idx_transaction_dependencies_status" ON "transaction_dependencies"("status");

CREATE INDEX "idx_transaction_dependencies_evidence_id" ON "transaction_dependencies"("evidence_id");

CREATE INDEX "idx_people_organization_id" ON "people"("organization_id");

CREATE INDEX "idx_people_last_contact" ON "people"("last_contact");

CREATE INDEX "idx_transaction_parties_transaction_id" ON "transaction_parties"("transaction_id");

CREATE INDEX "idx_transaction_parties_person_id" ON "transaction_parties"("person_id");

CREATE INDEX "idx_transaction_parties_organization_id" ON "transaction_parties"("organization_id");

CREATE INDEX "idx_documents_operation_id" ON "documents"("operation_id");

CREATE INDEX "idx_documents_status" ON "documents"("status");

CREATE INDEX "idx_documents_document_date" ON "documents"("document_date");

CREATE INDEX "idx_documents_expires_at" ON "documents"("expires_at");

CREATE INDEX "idx_documents_transaction_id" ON "documents"("transaction_id");

CREATE INDEX "idx_documents_property_id" ON "documents"("property_id");

CREATE INDEX "idx_documents_issuer_id" ON "documents"("issuer_id");

CREATE INDEX "idx_documents_organization_id" ON "documents"("organization_id");

CREATE INDEX "idx_contracts_transaction_id" ON "contracts"("transaction_id");

CREATE INDEX "idx_contracts_document_id" ON "contracts"("document_id");

CREATE INDEX "idx_contracts_document_version_id" ON "contracts"("document_version_id");

CREATE INDEX "idx_contracts_signature_status" ON "contracts"("signature_status");

CREATE INDEX "idx_contracts_drafted_at" ON "contracts"("drafted_at");

CREATE INDEX "idx_contracts_signed_at" ON "contracts"("signed_at");

CREATE INDEX "idx_contracts_effective_at" ON "contracts"("effective_at");

CREATE INDEX "idx_contract_clauses_contract_id" ON "contract_clauses"("contract_id");

CREATE INDEX "idx_contract_clauses_review_status" ON "contract_clauses"("review_status");

CREATE INDEX "idx_obligations_transaction_id" ON "obligations"("transaction_id");

CREATE INDEX "idx_obligations_clause_id" ON "obligations"("clause_id");

CREATE INDEX "idx_obligations_obligated_id" ON "obligations"("obligated_id");

CREATE INDEX "idx_obligations_beneficiary_id" ON "obligations"("beneficiary_id");

CREATE INDEX "idx_obligations_due_date" ON "obligations"("due_date");

CREATE INDEX "idx_obligations_evidence_required" ON "obligations"("evidence_required");

CREATE INDEX "idx_obligations_evidence_id" ON "obligations"("evidence_id");

CREATE INDEX "idx_obligations_status" ON "obligations"("status");

CREATE INDEX "idx_obligations_risk" ON "obligations"("risk");

CREATE INDEX "idx_tasks_operation_id" ON "tasks"("operation_id");

CREATE INDEX "idx_tasks_transaction_id" ON "tasks"("transaction_id");

CREATE INDEX "idx_tasks_responsible_id" ON "tasks"("responsible_id");

CREATE INDEX "idx_tasks_due_date" ON "tasks"("due_date");

CREATE INDEX "idx_tasks_status" ON "tasks"("status");

CREATE INDEX "idx_tasks_priority" ON "tasks"("priority");

CREATE INDEX "idx_tasks_risk" ON "tasks"("risk");

CREATE INDEX "idx_tasks_recurrence" ON "tasks"("recurrence");

CREATE INDEX "idx_tasks_evidence_id" ON "tasks"("evidence_id");

CREATE INDEX "idx_task_dependencies_task_id" ON "task_dependencies"("task_id");

CREATE INDEX "idx_task_dependencies_prerequisite_id" ON "task_dependencies"("prerequisite_id");

CREATE INDEX "idx_task_items_task_id" ON "task_items"("task_id");

CREATE INDEX "idx_task_items_status" ON "task_items"("status");

CREATE INDEX "idx_task_items_evidence_id" ON "task_items"("evidence_id");

CREATE INDEX "idx_deadlines_transaction_id" ON "deadlines"("transaction_id");

CREATE INDEX "idx_deadlines_clause_id" ON "deadlines"("clause_id");

CREATE INDEX "idx_deadlines_due_date" ON "deadlines"("due_date");

CREATE INDEX "idx_deadlines_status" ON "deadlines"("status");

CREATE INDEX "idx_deadlines_responsible_id" ON "deadlines"("responsible_id");

CREATE INDEX "idx_deadlines_evidence_id" ON "deadlines"("evidence_id");

CREATE INDEX "idx_appointments_operation_id" ON "appointments"("operation_id");

CREATE INDEX "idx_appointments_transaction_id" ON "appointments"("transaction_id");

CREATE INDEX "idx_appointments_person_id" ON "appointments"("person_id");

CREATE INDEX "idx_mortgages_transaction_id" ON "mortgages"("transaction_id");

CREATE INDEX "idx_mortgages_bank_id" ON "mortgages"("bank_id");

CREATE INDEX "idx_mortgages_contact_id" ON "mortgages"("contact_id");

CREATE INDEX "idx_mortgages_rate_type" ON "mortgages"("rate_type");

CREATE INDEX "idx_mortgages_status" ON "mortgages"("status");

CREATE INDEX "idx_mortgages_requested_date" ON "mortgages"("requested_date");

CREATE INDEX "idx_mortgages_valuation_date" ON "mortgages"("valuation_date");

CREATE INDEX "idx_mortgages_approval_date" ON "mortgages"("approval_date");

CREATE INDEX "idx_mortgages_disbursement_date" ON "mortgages"("disbursement_date");

CREATE INDEX "idx_mortgage_offers_mortgage_id" ON "mortgage_offers"("mortgage_id");

CREATE INDEX "idx_mortgage_offers_bank_id" ON "mortgage_offers"("bank_id");

CREATE INDEX "idx_mortgage_offers_valid_until" ON "mortgage_offers"("valid_until");

CREATE INDEX "idx_mortgage_offers_document_id" ON "mortgage_offers"("document_id");

CREATE INDEX "idx_movements_operation_id" ON "movements"("operation_id");

CREATE INDEX "idx_movements_transaction_id" ON "movements"("transaction_id");

CREATE INDEX "idx_movements_direction" ON "movements"("direction");

CREATE INDEX "idx_movements_category" ON "movements"("category");

CREATE INDEX "idx_movements_expected_date" ON "movements"("expected_date");

CREATE INDEX "idx_movements_actual_date" ON "movements"("actual_date");

CREATE INDEX "idx_movements_availability_date" ON "movements"("availability_date");

CREATE INDEX "idx_movements_status" ON "movements"("status");

CREATE INDEX "idx_movements_confidence" ON "movements"("confidence");

CREATE INDEX "idx_movements_person_id" ON "movements"("person_id");

CREATE INDEX "idx_movements_document_id" ON "movements"("document_id");

CREATE INDEX "idx_scenarios_operation_id" ON "scenarios"("operation_id");

CREATE INDEX "idx_suppliers_organization_id" ON "suppliers"("organization_id");

CREATE INDEX "idx_suppliers_person_id" ON "suppliers"("person_id");

CREATE INDEX "idx_works_transaction_id" ON "works"("transaction_id");

CREATE INDEX "idx_works_property_id" ON "works"("property_id");

CREATE INDEX "idx_works_supplier_id" ON "works"("supplier_id");

CREATE INDEX "idx_works_status" ON "works"("status");

CREATE INDEX "idx_works_start_date" ON "works"("start_date");

CREATE INDEX "idx_works_end_date" ON "works"("end_date");

CREATE INDEX "idx_works_task_id" ON "works"("task_id");

CREATE INDEX "idx_works_warranty_document_id" ON "works"("warranty_document_id");

CREATE INDEX "idx_estimates_work_id" ON "estimates"("work_id");

CREATE INDEX "idx_estimates_supplier_id" ON "estimates"("supplier_id");

CREATE INDEX "idx_estimates_status" ON "estimates"("status");

CREATE INDEX "idx_estimates_valid_until" ON "estimates"("valid_until");

CREATE INDEX "idx_estimates_document_id" ON "estimates"("document_id");

CREATE INDEX "idx_communications_operation_id" ON "communications"("operation_id");

CREATE INDEX "idx_communications_transaction_id" ON "communications"("transaction_id");

CREATE INDEX "idx_communications_person_id" ON "communications"("person_id");

CREATE INDEX "idx_communications_kind" ON "communications"("kind");

CREATE INDEX "idx_communications_status" ON "communications"("status");

CREATE INDEX "idx_communications_contract_id" ON "communications"("contract_id");

CREATE INDEX "idx_communications_task_id" ON "communications"("task_id");

CREATE INDEX "idx_communications_document_id" ON "communications"("document_id");

CREATE INDEX "idx_decisions_operation_id" ON "decisions"("operation_id");

CREATE INDEX "idx_decisions_transaction_id" ON "decisions"("transaction_id");

CREATE INDEX "idx_decisions_person_id" ON "decisions"("person_id");

CREATE INDEX "idx_decisions_status" ON "decisions"("status");

CREATE INDEX "idx_decisions_decision_date" ON "decisions"("decision_date");

CREATE INDEX "idx_decisions_communication_id" ON "decisions"("communication_id");

CREATE INDEX "idx_decisions_document_id" ON "decisions"("document_id");

CREATE INDEX "idx_checklists_transaction_id" ON "checklists"("transaction_id");

CREATE INDEX "idx_checklist_items_checklist_id" ON "checklist_items"("checklist_id");

CREATE INDEX "idx_checklist_items_responsible_id" ON "checklist_items"("responsible_id");

CREATE INDEX "idx_checklist_items_kind" ON "checklist_items"("kind");

CREATE INDEX "idx_checklist_items_status" ON "checklist_items"("status");

CREATE INDEX "idx_checklist_items_due_date" ON "checklist_items"("due_date");

CREATE INDEX "idx_checklist_items_evidence_id" ON "checklist_items"("evidence_id");

CREATE INDEX "idx_checklist_items_depends_on_id" ON "checklist_items"("depends_on_id");

CREATE INDEX "idx_document_links_document_id" ON "document_links"("document_id");

CREATE INDEX "idx_document_links_task_id" ON "document_links"("task_id");

CREATE INDEX "idx_document_links_obligation_id" ON "document_links"("obligation_id");

CREATE INDEX "idx_document_links_clause_id" ON "document_links"("clause_id");

CREATE INDEX "idx_document_links_movement_id" ON "document_links"("movement_id");

CREATE INDEX "idx_document_links_deadline_id" ON "document_links"("deadline_id");

CREATE INDEX "idx_document_links_work_id" ON "document_links"("work_id");

CREATE UNIQUE INDEX idx_task_dependency_unique ON task_dependencies(task_id, prerequisite_id);

CREATE UNIQUE INDEX idx_transaction_dependency_unique ON transaction_dependencies(transaction_id, prerequisite_id);

CREATE INDEX idx_document_version_doc ON document_versions(document_id,version);

CREATE INDEX idx_audit_entity ON audit_events(entity,entity_id,created_at);
