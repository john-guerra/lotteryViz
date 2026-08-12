// Minimal .env loader shared by the server routes (the CLI scripts each inline
// their own copy; the Express server doesn't load .env on its own). Populates
// process.env from the repo-root .env without overwriting already-set vars.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

let loaded = false;

export function loadDotenv() {
  if (loaded) return;
  loaded = true;
  const root = dirname(fileURLToPath(import.meta.url));
  try {
    const envFile = readFileSync(join(root, ".env"), "utf8");
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // No .env file — rely on the ambient environment.
  }
}
