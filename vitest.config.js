import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { jsxInJs } from "./front/vite-jsx-in-js.mjs";

// One config, two environments. Before this, the repo ran two separate Jest
// setups: a node/ESM one for .mjs backend tests and react-scripts' jsdom one
// for components. A test placed in the wrong tree silently never ran, which
// cost real debugging time. `test.projects` replaces the deprecated `workspace`
// file (deprecated since Vitest 3.2).
//
// The jsdom project needs the same `jsxInJs` escalation as front/vite.config.mjs
// (StudentTable.test.js imports .js components full of JSX; @vitejs/plugin-react
// alone does not parse JSX out of .js files under Rolldown/oxc -- see
// front/vite-jsx-in-js.mjs for the full reasoning and upstream citation).
// Imported from front/ rather than duplicated so the build and test configs
// can't drift apart on this escalation.
//
// That said, this file does NOT read ./front/vite.config.mjs -- it only
// shares the jsxInJs plugin above. If resolution-affecting options are
// added there -- resolve.alias, define, CSS modules/handling, env vars --
// mirror them in the jsdom project below too, or tests will validate
// against different module resolution than what actually ships in the
// build.
export default defineConfig({
  test: {
    // Runs once per `vitest run` invocation, before any project's `include`
    // glob is evaluated -- so it fires even if a project's include pattern
    // ends up matching zero files, or a project is renamed/deleted outright.
    // See vitest.global-setup.mjs.
    globalSetup: ["./vitest.global-setup.mjs"],
    // The suite uses bare describe/test/expect with no `import { describe } from
    // "vitest"` (carried over unchanged from Jest, which injects these as
    // globals). `globals: true` on each project reproduces that. Vitest does
    // not merge this setting down from the top-level `test` block onto
    // `projects`, so it is repeated per project rather than declared once.
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          globals: true,
          include: [
            "__tests__/**/*.test.mjs",
            "slack-checker/__tests__/**/*.test.mjs",
          ],
        },
      },
      {
        plugins: [react(), jsxInJs()],
        test: {
          name: "jsdom",
          environment: "jsdom",
          globals: true,
          include: ["front/src/**/*.test.{js,jsx}"],
          setupFiles: ["front/src/setupTests.js"],
        },
      },
    ],
  },
});
