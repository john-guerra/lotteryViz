import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { jsxInJs } from "./vite-jsx-in-js.mjs";

// The Express server serves front/build (app.js:23) and does SPA fallback from
// it (app.js:33), so the output directory stays "build" rather than Vite's
// default "dist". One line here avoids coordinated edits to the server,
// .gitignore, and CLAUDE.md -- and avoids a stale build/ being served silently
// if any one of them were missed.
//
// The `jsxInJs` plugin (forcing our own .js files to be parsed as JSX) lives
// in ./vite-jsx-in-js.mjs, shared with the root vitest.config.js jsdom
// project, so the build and test configs can't drift apart on this escalation.
// See that module's comments for the full reasoning and upstream citation.

// This config and the root ../vitest.config.js (jsdom project) do NOT share
// anything beyond the jsxInJs plugin. If you add resolution-affecting
// options here -- resolve.alias, define, CSS modules/handling, env vars --
// mirror them in ../vitest.config.js too, or tests will validate against
// different module resolution than what actually ships in the build.

const BACKEND = "http://localhost:4001";

// CRA's "proxy" field forwarded every unmatched request. Vite matches explicit
// prefixes, so each backend mount point is listed. Derived by scanning every
// fetch() call site in front/src.
const PROXIED = [
  "/api",
  "/getGrades",
  "/getAllGrades",
  "/getCounts",
  "/setGrade",
  "/delete",
];

export default defineConfig({
  plugins: [react(), jsxInJs()],
  build: { outDir: "build" },
  server: {
    proxy: Object.fromEntries(PROXIED.map((path) => [path, BACKEND])),
  },
});
