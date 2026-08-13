# Migrate to Vite, and Consolidate Both Test Suites on Vitest

**Date:** 2026-08-13
**Status:** Approved design

## Summary

Replace `react-scripts` with Vite in `front/`, and replace both Jest runners with a
single Vitest config at the repo root.

The immediate motivation is a concrete failure: `front/src/App.test.js` could not
resolve `react-router-dom` because CRA 5 pins Jest 27, whose resolver ignores the
`exports` field in `package.json`. That is not fixable while `react-scripts` is in the
stack — it pins the Jest version.

Playwright end-to-end testing is **out of scope** and gets its own spec. See
"Out of scope" for why.

## Background

### Why the build tool has to move

`react-scripts` was formally sunset by the React team in February 2025. It receives no
security patches, no dependency updates, and no compatibility fixes. It also pins the
toolchain underneath it, which is what makes the test failure unfixable in place.

### Why the test runner has to move with it

The project currently runs **two** Jest configurations:

| Runner | Command | Config | Scope |
|---|---|---|---|
| Root | `yarn test` | `jest.config.js` — `testEnvironment: 'node'`, `transform: {}`, launched with `--experimental-vm-modules` | 12 suites, 144 tests, `.mjs` only |
| CRA | `cd front && yarn test` | owned by `react-scripts`, jsdom + JSX transform | 1 suite, 13 tests |

This split has cost real time. A React component test placed in the root `__tests__/`
directory silently never runs, and a `.mjs` node test placed in `front/src` silently
never runs. Neither failure is loud. The implementation plan for the Canvas grade
column had to carry a Global Constraint explaining the split so implementers would not
trip over it.

Vitest is ESM-native and honors `exports` maps, which fixes the original failure, and
its `test.projects` config runs both environments from one file, which ends the split.

### Measured migration surface

Scanned before committing to this design:

| Common CRA→Vite obstacle | Present here |
|---|---|
| `REACT_APP_*` environment variables | **none** |
| `process.env` in application code | only `front/src/serviceWorker.js` — CRA boilerplate |
| SVG-as-component imports (`ReactComponent`) | **none** |
| LESS/SASS requiring a preprocessor | `App.less`, `Lottery.less` exist but are **imported nowhere**; `less` is not a dependency |
| Plain CSS imports | 7 — Vite handles natively |
| Frontend test files to port | 1 |
| **JSX inside `.js` files** | **19 of 27 files** — the one real obstacle |

## Decisions

| Question | Decision |
|---|---|
| Scope | Vite + Vitest only; Playwright is a separate spec |
| Vite build output | `build.outDir: 'build'` so the backend is untouched |
| JSX in `.js` files | esbuild loader override — no file renames |
| Test configuration | One root `vitest.config.js` with two projects |
| Test dependency location | Test deps at root, build deps in `front/` |

The build-output decision is the difference between one line of config and coordinated
edits to `app.js`, `.gitignore`, and `CLAUDE.md` — with a stale `front/build/` silently
being served if any one of them were missed.

---

## Section 1 — Vite in `front/`

Remove `react-scripts`; add `vite` and `@vitejs/plugin-react` as devDependencies.

`front/public/index.html` moves to `front/index.html` (Vite treats it as the entry
point rather than a static asset) and gains a module script tag:

```html
<script type="module" src="/src/index.js"></script>
```

The CRA `%PUBLIC_URL%` placeholders in that file are removed — Vite resolves `/`-rooted
paths directly. `favicon.ico`, `manifest.json`, and `robots.txt` stay in `front/public/`
and continue to be served from the root.

New `front/vite.config.js`:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "build" },
  esbuild: { loader: "jsx", include: /src\/.*\.js$/ },
  optimizeDeps: { esbuildOptions: { loader: { ".js": "jsx" } } },
  server: {
    proxy: Object.fromEntries(
      [
        "/api",
        "/getGrades",
        "/getAllGrades",
        "/getCounts",
        "/setGrade",
        "/delete",
      ].map((p) => [p, "http://localhost:4001"])
    ),
  },
});
```

Scripts become `vite` / `vite build` / `vite preview`.

### The proxy needs explicit paths

CRA's `"proxy": "http://localhost:4001"` field forwards **every** unmatched request.
Vite's `server.proxy` matches explicit prefixes, so each backend path must be listed.
The frontend calls, verified by scanning every `fetch` call site:

| Path | Mounted at |
|---|---|
| `/api/participation/*` | `app.js:28` |
| `/api/canvas/*` | `app.js:29` |
| `/getGrades/:course` | `routes/index.js:51` |
| `/getAllGrades/:course` | `routes/index.js:77` |
| `/getCounts/:course` | `routes/index.js:98` |
| `/setGrade`, `/delete` | `routes/index.js:19`, `:33` |

Note that `getCounts/`, `getAllGrades/`, and `getGrades` are fetched **without** a
leading slash, so they resolve relative to the page URL. They still arrive at the
server as `/getCounts/...` because the app's routes have no path depth, but the proxy
config must match the leading-slash form.

This matters less than it appears: `CLAUDE.md` already directs contributors to build
and test against the backend at `http://localhost:4001` rather than the dev server. The
proxy exists so `vite dev` works for anyone who prefers it, not as the primary path.

## Section 2 — JSX inside `.js` files

19 of 27 files in `front/src` contain JSX with a `.js` extension. Vite does not
transform JSX in `.js` by default.

The esbuild override above handles it with no file renames and no import changes. The
alternative — renaming all 19 to `.jsx` — is more idiomatic, and imports would still
resolve without edits, but it rewrites the file identity of every component in the app
including the ones changed by recent work, for no functional gain.

**The same override must be mirrored in the root Vitest config**, or component tests
will fail to parse JSX even though the build succeeds. This is the single most likely
way to get a half-working migration, and the implementation plan must verify both
sides independently.

If `esbuild.include` proves not to apply to the loader as expected, the fallback is a
small custom plugin with a `transform` hook applying the `jsx` loader to matching
files. The plan should treat "the build succeeds AND component tests parse JSX" as the
acceptance condition, not the presence of a particular config key.

## Section 3 — Vitest at the root

Delete `jest.config.js` and the `--experimental-vm-modules` flag. New root
`vitest.config.js`:

```js
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["__tests__/**/*.test.mjs", "slack-checker/__tests__/**/*.test.mjs"],
        },
      },
      {
        plugins: [react()],
        esbuild: { loader: "jsx", include: /front\/src\/.*\.js$/ },
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["front/src/**/*.test.{js,jsx}"],
          setupFiles: ["front/src/setupTests.js"],
        },
      },
    ],
  },
});
```

`test.projects` is the current API; the older `workspace` file has been deprecated
since Vitest 3.2.

Root devDependencies gain `vitest`, `jsdom`, `@vitejs/plugin-react`, and the
`@testing-library/*` packages, since the root now owns the test configuration.
`front/package.json` keeps `vite` and `@vitejs/plugin-react` for building. The React
plugin is duplicated across both packages; that is accepted in exchange for not
restructuring the repo.

`front/src/setupTests.js` changes its single import from
`@testing-library/jest-dom/extend-expect` to `@testing-library/jest-dom/vitest`.

**No test bodies change.** Every existing test uses only `describe`, `test`, and
`expect`; there are no `jest.*` calls anywhere in the suite, so the usual `jest.*` →
`vi.*` rewrite does not apply.

## Section 4 — Cleanup folded in

Three things are deleted because the migration makes them dead, not as opportunistic
refactoring:

1. **`front/src/serviceWorker.js`** and the `serviceWorker.unregister()` call at
   `front/src/index.js:19`. Its only effect is unregistering a service worker this app
   never registers, and it reads `process.env.PUBLIC_URL`, which does not exist under
   Vite. Removing it eliminates the only `process.env` use in the frontend.
2. **`front/src/App.less` and `front/src/Lottery.less`** — imported nowhere, and `less`
   is not a dependency, so they cannot currently be compiled by anything.
3. **`jest.config.js`** — superseded.

`postinstall` (`"cd front && npm install && npm run build"`) is changed to use yarn
consistently, matching every other script in the file.

## Section 5 — Verification

The migration is verified, not assumed:

- `yarn test` → **157 tests** across both projects, all passing. The count is the
  arithmetic check that neither project silently matched zero files — the exact failure
  mode the old split produced.
- Each project runs in isolation (`yarn test --project node`, `--project jsdom`) and
  reports a non-zero test count, proving both `include` patterns match.
- `cd front && yarn build` → assets written to `front/build/`, with `index.html` at its
  root.
- `yarn dev` → the app loads at `http://localhost:4001`. The Admin page renders, the
  Grade column loads, and the export modal opens a preview — the paths most recently
  changed, and the ones exercising both the proxy-relevant routes and JSX-heavy
  components.
- The deliberate-break check for JSX: temporarily removing the esbuild override must
  cause component tests to fail. A migration where the override is unnecessary means it
  is not doing what the spec claims.

## Out of scope

**Playwright and end-to-end testing.** Deferred to its own spec because it raises
questions this one does not touch: whether e2e runs against the real local Mongo or a
seeded test database; how the Canvas API is handled given a live export writes real
grades; where fixture data comes from given `students.mjs` is gitignored; and what runs
the suite, given the repo has no CI. Those are better answered after living with the
new setup.

**Also not doing:** adding CI; collapsing `front/` into the root package; yarn
workspaces; renaming `.js` files to `.jsx`; upgrading d3 from v5; and touching any
application behavior. This migration changes how the code is built and tested, not what
it does.
