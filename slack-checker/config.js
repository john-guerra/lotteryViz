import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

/** Parsed config object keyed by course, or {} if the file is missing. */
export function loadAllScanConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

/** Config for one course, or null if absent. */
export function loadScanConfig(course) {
  return loadAllScanConfig()[course] || null;
}
