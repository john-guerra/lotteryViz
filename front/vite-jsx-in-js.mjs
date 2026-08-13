import path from "node:path";
import { transformWithOxc } from "vite";

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
//
// Extracted into its own module (rather than duplicated in vite.config.mjs
// and vitest.config.js) so the build config and the test config can't drift
// out of sync with each other. Lives in front/ specifically so that
// import.meta.dirname resolves to <repo>/front for every caller -- that
// keeps the SRC_DIR anchor correct with no parameter to pass and no way for
// the two callers to disagree.
//
// Scoped by resolved path prefix, anchored to this module's own directory
// (import.meta.dirname), not process.cwd() -- cwd depends on where the
// command is invoked from. A substring/regex match on "src/" would also
// catch any dependency that ships an unbundled src/ directory (d3's
// sub-packages do), forcing JSX parsing onto third-party code we don't own.
const SRC_DIR = path.join(import.meta.dirname, "src") + path.sep;

function isOwnJsFile(id) {
  const [filepath] = id.split("?");
  return filepath.startsWith(SRC_DIR) && filepath.endsWith(".js");
}

export function jsxInJs() {
  return {
    name: "jsx-in-js",
    enforce: "pre",
    async transform(code, id) {
      if (!isOwnJsFile(id)) return null;
      return transformWithOxc(code, id, { lang: "jsx" });
    },
  };
}
