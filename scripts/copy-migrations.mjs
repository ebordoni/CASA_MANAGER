import { cpSync } from "node:fs";
cpSync("migrations", "dist/migrations", { recursive: true });
cpSync("initial-data.json", "dist/initial-data.json");
