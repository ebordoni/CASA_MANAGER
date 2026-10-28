import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { BackupCounts, RecoveryPoint } from "../shared/backup.js";

const datasetId = z.union([z.literal("legacy"), z.uuid()]);
const pointSchema = z.object({
  id: z.uuid(),
  dataset: datasetId,
  createdAt: z.iso.datetime(),
  operations: z.array(z.string()),
  counts: z.record(z.string(), z.number().int().nonnegative()),
});
const catalogSchema = z.object({
  version: z.literal(1),
  active: datasetId,
  recoveryPoints: z.array(pointSchema),
});
type Catalog = z.infer<typeof catalogSchema>;

export function atomicJson(path: string, data: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(data));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

export class StorageCatalog {
  readonly root: string;
  private catalog: Catalog;
  constructor(root: string) {
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.catalog = existsSync(this.catalogPath)
      ? catalogSchema.parse(JSON.parse(readFileSync(this.catalogPath, "utf8")))
      : { version: 1, active: "legacy", recoveryPoints: [] };
  }
  private get catalogPath() {
    return resolve(this.root, "active-dataset.json");
  }
  get generation() {
    return this.catalog.active;
  }
  datasetPath(id: string) {
    datasetId.parse(id);
    return id === "legacy" ? this.root : resolve(this.root, "datasets", id);
  }
  get currentPath() {
    return this.datasetPath(this.generation);
  }
  activate(
    id: string,
    previous: { operations: string[]; counts: BackupCounts },
  ): RecoveryPoint {
    z.uuid().parse(id);
    if (!existsSync(resolve(this.datasetPath(id), "casa.sqlite")))
      throw new Error("Dataset di ripristino mancante");
    const point = {
      id: randomUUID(),
      dataset: this.generation,
      createdAt: new Date().toISOString(),
      ...previous,
    };
    const next: Catalog = {
      version: 1,
      active: id,
      recoveryPoints: [point, ...this.catalog.recoveryPoints],
    };
    // A single atomic pointer records both the active dataset and its recovery point.
    atomicJson(this.catalogPath, next);
    this.catalog = next;
    const { dataset: _dataset, ...publicPoint } = point;
    return publicPoint;
  }
  recoveryPoints(): RecoveryPoint[] {
    return this.catalog.recoveryPoints.map(
      ({ dataset: _dataset, ...point }) => point,
    );
  }
  recoveryPath(id: string) {
    const point = this.catalog.recoveryPoints.find((point) => point.id === id);
    return point ? this.datasetPath(point.dataset) : null;
  }
}
