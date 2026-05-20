import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../");

export function readContract(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}
