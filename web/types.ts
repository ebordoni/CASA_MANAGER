import type { Row } from "../shared/model";
import type { Service } from "../server/service";
export type Data = Record<string, Row[]>;
export type DashboardData = ReturnType<Service["dashboard"]>;
export type Bootstrap = {
  generation: string;
  data: Data;
  dashboard: DashboardData;
};
export type CashTimeline = ReturnType<Service["cashTimeline"]>;
export type EditorRequest = {
  entity: string;
  row?: Row;
  preset?: Record<string, string>;
};
export function scoped(data: Data, entity: string, operationId: string): Row[] {
  const belongs = (
    table: string,
    row: Row,
    seen = new Set<string>(),
  ): boolean => {
    if (table === "operations") return row.id === operationId;
    if (row.operation_id) return row.operation_id === operationId;
    if (seen.has(`${table}:${row.id}`)) return false;
    const visited = new Set(seen).add(`${table}:${row.id}`);
    const paths: [string, string][] = [
      ["transaction_id", "transactions"],
      ["property_id", "properties"],
      ["contract_id", "contracts"],
      ["clause_id", "contract_clauses"],
      ["checklist_id", "checklists"],
      ["task_id", "tasks"],
      ["work_id", "works"],
      ["mortgage_id", "mortgages"],
      ["document_id", "documents"],
    ];
    for (const [key, target] of paths)
      if (row[key]) {
        const parent = data[target]?.find((r) => r.id === row[key]);
        return !!parent && belongs(target, parent, visited);
      }
    return true;
  };
  return (data[entity] ?? []).filter((row) => belongs(entity, row));
}
