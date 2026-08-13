import { defineConfig, transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";

// The Express server serves front/build (app.js:23) and does SPA fallback from
// it (app.js:33), so the output directory stays "build" rather than Vite's
// default "dist". One line here avoids coordinated edits to the server,
// .gitignore, and CLAUDE.md -- and avoids a stale build/ being served silently
// if any one of them were missed.
//
// @vitejs/plugin-react@6 is Oxc-based, not Babel-based, on this Vite version:
// vite@8.2.1 defaults to the Rolldown/oxc bundler, and the plugin only
// configures Oxc's *fast-refresh* transform -- it does not change which
// files get parsed with JSX enabled. Rolldown decides that per-file from the
// extension (.jsx/.tsx get it, .js/.ts don't), and neither `esbuild.loader`
// nor `build.rollupOptions.moduleTypes` override that for the main build in
// this version (both were tried and failed; see task-1-report.md). The only
// working fix, taken from https://github.com/vitejs/rolldown-vite/discussions/323,
// is a small pre-transform plugin that force-parses our own .js files as JSX
// via Vite's own `transformWithOxc` helper.
const jsxInJsFiles = /(^|\/)src\/.*\.js$/;
function jsxInJs() {
  return {
    name: "jsx-in-js",
    enforce: "pre",
    async transform(code, id) {
      if (!jsxInJsFiles.test(id)) return null;
      return transformWithOxc(code, id, { lang: "jsx" });
    },
  };
}

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
