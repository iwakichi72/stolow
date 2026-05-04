import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL("..", import.meta.url)));
const from = path.join(root, "dist-electron/main/preload.js");
const to = path.join(root, "dist-electron/main/preload.cjs");

if (!existsSync(from)) {
  throw new Error(`Expected preload output at ${from}. Run tsc -p tsconfig.preload.json first.`);
}
renameSync(from, to);
