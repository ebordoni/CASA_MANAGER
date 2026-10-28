import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { entities, type Scalar } from "../shared/model.js";
import { Service } from "./service.js";

const initialSchema = z.object({
  formatVersion: z.literal(1),
  records: z.array(
    z.object({
      key: z.string().min(1),
      entity: z.enum(Object.keys(entities) as [string, ...string[]]),
      data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
    }),
  ),
});

export function seed(service: Service, initialDataFile?: string) {
  if (service.db.list("operations").length) return;
  const configuredFile = initialDataFile ?? process.env.INITIAL_DATA_FILE;
  const file = configuredFile
    ? resolve(configuredFile)
    : new URL("../initial-data.json", import.meta.url);
  const initial = initialSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  service.db.atomic(() => {
    const ids = new Map<string, string>();
    for (const record of initial.records) {
      if (ids.has(record.key))
        throw new Error(`Chiave duplicata nei dati iniziali: ${record.key}`);
      const data: Record<string, Scalar> = {};
      for (const [field, value] of Object.entries(record.data)) {
        if (
          entities[record.entity].fields[field]?.ref &&
          typeof value === "string" &&
          value.startsWith("@")
        ) {
          const id = ids.get(value.slice(1));
          if (!id)
            throw new Error(`Riferimento iniziale non risolto: ${value}`);
          data[field] = id;
        } else data[field] = value;
      }
      const saved = service.save(
        record.entity,
        data,
        undefined,
        undefined,
        false,
        "initial-import",
      );
      ids.set(record.key, saved.id);
    }
    if (!service.db.list("operations").length)
      throw new Error(
        "La configurazione iniziale deve contenere almeno un’operazione",
      );
  });
}
