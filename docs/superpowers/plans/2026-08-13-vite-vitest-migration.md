# Vite + Vitest Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `react-scripts` with Vite, and replace both Jest runners with a single root Vitest config, without changing any application behavior.

**Architecture:** Two independent halves. The build half swaps `react-scripts` for Vite inside `front/`, keeping the output directory at `build/` so the Express server is untouched. The test half deletes `jest.config.js` and adds a root `vitest.config.js` whose `test.projects` array runs the 12 node `.mjs` suites and the 1 jsdom component suite in one command. Build first, tests second — a broken build makes test failures ambiguous.

**Tech Stack:** Vite 8, `@vitejs/plugin-react` 6, Vitest 4, jsdom 30, `@testing-library/react` 16, `@testing-library/jest-dom` 7, Express 4, React 18.

**Spec:** `docs/superpowers/specs/2026-08-13-vite-vitest-migration-design.md`

## Global Constraints

- **Baseline that must be preserved: 144 node tests + 13 component tests = 157.** Any final count other than 157 means a project matched the wrong files. A suite that matches zero files reports success — the count is the real check, not the exit code.
- **No application behavior changes.** This migration changes how code is built and tested, not what it does. No component logic, no route handlers, no grading arithmetic.
- **`app.js` must not be modified.** It serves `front/build` at `:23` and does SPA fallback at `:33`. Vite is configured with `build.outDir: "build"` so this keeps working. If you find yourself editing `app.js`, the Vite config is wrong.
- **No test bodies change.** The suite uses only `describe`, `test`, and `expect`; there are zero `jest.*` calls. The usual `jest.*` → `vi.*` migration does not apply here. If you are rewriting assertions, stop.
- **JSX-in-`.js` config is empirical, not assumed.** `@vitejs/plugin-react` is Babel-based and processes `.js` by default. Start with plain `react()` and add configuration only if a build or test actually fails. Any key you add must be proven necessary by removing it and observing a failure; a key whose removal changes nothing must be deleted.
- **`front/src/students.mjs`, `canvas-config.json`, and `canvas-export-log.txt` are untracked and private.** The repo is public. Never put real student names, Canvas IDs, or course keys into code, tests, commit messages, or reports.
- **`participation-tooltip.png`** is untracked and belongs to the user. Never `git add -A`, `git add .`, or `git commit -a`. Stage only files named in each task's commit step.
- Verify the frontend against the backend at `http://localhost:4001` after building, per `CLAUDE.md` — not against the dev server.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `front/package.json` | Modify | Drop `react-scripts`; add `vite` + `@vitejs/plugin-react`; rewrite scripts |
| `front/vite.config.js` | Create | Build config: React plugin, `outDir: "build"`, dev proxy |
| `front/index.html` | Create (moved) | Vite entry point, with module script tag |
| `front/public/index.html` | Delete | Superseded; Vite treats `index.html` as source, not a static asset |
| `front/src/index.js` | Modify | Drop the `serviceWorker` import and its call |
| `front/src/serviceWorker.js` | Delete | CRA boilerplate; only unregisters; reads `process.env.PUBLIC_URL` |
| `front/src/App.less`, `front/src/Lottery.less` | Delete | Imported nowhere; `less` is not a dependency |
| `package.json` (root) | Modify | Add test devDependencies; point `test` at Vitest; fix `postinstall` |
| `vitest.config.js` | Create | Both test projects in one config |
| `jest.config.js` | Delete | Superseded |
| `front/src/setupTests.js` | Modify | Import the Vitest entry of `jest-dom` |
| `CLAUDE.md` | Modify | Document the single test command and the new frontend commands |

---

### Task 1: Stand up Vite and prove the build

The build must work before tests move, so a test failure is never ambiguous about its cause.

**Files:**
- Modify: `front/package.json`
- Create: `front/vite.config.js`
- Create: `front/index.html`
- Delete: `front/public/index.html`
- Modify: `front/src/index.js:6`, `:19`
- Delete: `front/src/serviceWorker.js`, `front/src/App.less`, `front/src/Lottery.less`

**Interfaces:**
- Consumes: nothing
- Produces: a production build in `front/build/` containing `index.html` and a hashed asset bundle; `front/vite.config.js` exporting a Vite config whose `build.outDir` is `"build"`

- [ ] **Step 1: Record the pre-migration baseline**

Run these and write the numbers down — later steps compare against them:

```bash
yarn test 2>&1 | grep -E "Tests:"
cd front && CI=true yarn test --watchAll=false 2>&1 | grep -E "Tests:"
```

Expected: `144 passed` and `13 passed`.

- [ ] **Step 2: Swap the frontend dependencies**

```bash
cd front
yarn remove react-scripts
yarn add -D vite@^8.2.1 @vitejs/plugin-react@^6.0.5
```

Then edit `front/package.json`'s `scripts` block to exactly:

```json
  "scripts": {
    "start": "vite --host 0.0.0.0",
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview"
  },
```

The `eject` script is removed — it only existed for `react-scripts`. Also delete the top-level `"proxy": "http://localhost:4001"` key; it is a CRA feature and is replaced by `server.proxy` in the Vite config.

If `front/package.json` has an `eslintConfig` block extending `react-app`, leave it for now — it is inert without `react-scripts` and removing it is out of scope.

- [ ] **Step 3: Create the Vite config**

Create `front/vite.config.js`:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Express server serves front/build (app.js:23) and does SPA fallback from
// it (app.js:33), so the output directory stays "build" rather than Vite's
// default "dist". One line here avoids coordinated edits to the server,
// .gitignore, and CLAUDE.md -- and avoids a stale build/ being served silently
// if any one of them were missed.
//
// @vitejs/plugin-react is Babel-based and processes .js files by default, so
// JSX inside our .js components needs no extra configuration. Do not add any
// until a build actually fails without it.
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
  plugins: [react()],
  build: { outDir: "build" },
  server: {
    proxy: Object.fromEntries(PROXIED.map((path) => [path, BACKEND])),
  },
});
```

- [ ] **Step 4: Move the HTML entry point**

Vite treats `index.html` as the application's source entry, not a static asset, so it moves out of `public/` to the package root and gets a module script tag.

```bash
git mv front/public/index.html front/index.html
```

Then edit `front/index.html`: replace both `%PUBLIC_URL%` occurrences with nothing (so `href="/favicon.ico"` and `href="/manifest.json"`), delete the CRA explainer comments about `%PUBLIC_URL%` and about the file being a template, and add the module script as the last element inside `<body>`, after the existing bootstrap `<script>`:

```html
    <script type="module" src="/src/index.js"></script>
```

Keep everything else exactly as-is: the charset and viewport meta tags, the description, the manifest link, the bootstrap CSS `<link>` and JS `<script>` with their integrity attributes, the `<title>`, the `<noscript>`, and the `<div class="container"><div id="root"></div></div>` structure.

`front/public/` keeps `favicon.ico`, `manifest.json`, and `robots.txt` — Vite copies that directory's contents to the build root.

- [ ] **Step 5: Delete the service worker and the dead LESS files**

`serviceWorker.js` is CRA boilerplate whose only effect is unregistering a service worker this app never registers, and it reads `process.env.PUBLIC_URL`, which does not exist under Vite. The `.less` files are imported nowhere and `less` is not a dependency.

```bash
git rm front/src/serviceWorker.js front/src/App.less front/src/Lottery.less
```

Then in `front/src/index.js`, delete the import at line 6:

```js
import * as serviceWorker from "./serviceWorker";
```

and delete the trailing comment block plus the call, so the file now ends after the `root.render(...)` block:

```js
const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
```

- [ ] **Step 6: Build, and confirm JSX in `.js` compiled**

```bash
cd front && yarn build
```

Expected: a successful build. Then confirm the output landed where Express expects it:

```bash
ls front/build/index.html && ls front/build/assets | head
```

Expected: `index.html` exists, and `assets/` contains hashed `.js` and `.css` files.

**If the build fails with a JSX syntax error**, escalate one level at a time, re-running the build after each:
1. Change the plugin line to `plugins: [react({ include: /\.(js|jsx)$/ })]`
2. Only if that also fails, add `esbuild: { loader: "jsx", include: /src\/.*\.js$/ }` alongside it.

Record in your report which level was needed. Plain `react()` succeeding is the expected outcome — the plugin processes `.js` by default.

- [ ] **Step 7: Verify the built app actually runs**

Start the backend and load the app:

```bash
yarn dev
```

Open `http://localhost:4001` in a browser.

Expected: the app renders — not a blank page and no console errors about failing module loads. Navigate to `/admin` and confirm the student table renders with its columns including **Grade**, and that the **Export to Canvas** and **Load Canvas grades** buttons are present.

Do NOT click "Submit N grades to Canvas" anywhere — that writes real grades to a live gradebook. Clicking "Load Canvas grades" runs a dry run and is safe, but is not required for this task.

If you cannot drive a browser, say so plainly in your report and instead verify that `front/build/index.html` references the hashed bundle and that `curl -s localhost:4001 | head -20` returns that HTML. Do not claim a visual check you did not perform.

Stop the backend when done.

- [ ] **Step 8: Confirm the old test runners still work**

The test migration has not happened yet, so both suites must still pass unchanged. `react-scripts` is gone, so the frontend suite cannot run — that is expected at this point and is fixed in Task 2.

```bash
yarn test 2>&1 | grep -E "Tests:"
```

Expected: `144 passed`. If this number changed, the frontend work broke something in the backend suite, which should be impossible — investigate before continuing.

- [ ] **Step 9: Commit**

The `git mv` in Step 4 and the `git rm` in Step 5 already staged the move and the three deletions, so only the edited and created files need adding:

```bash
git add front/package.json front/vite.config.js front/index.html front/src/index.js front/yarn.lock
git status --short   # confirm: no unintended files staged, no stray deletions
git commit -m "build(front): replace react-scripts with Vite

Keeps the output directory at build/ so the Express server that serves
front/build and does SPA fallback from it is untouched. CRA's catch-all
proxy field becomes explicit prefixes in server.proxy, derived from every
fetch call site.

Drops serviceWorker.js -- CRA boilerplate that only unregisters a worker
this app never registers, and the frontend's only reader of process.env --
plus two .less files imported nowhere with no less dependency installed."
```

---

### Task 2: Consolidate both suites onto Vitest

**Files:**
- Create: `vitest.config.js`
- Delete: `jest.config.js`
- Modify: `package.json` (root)
- Modify: `front/src/setupTests.js`

**Interfaces:**
- Consumes: `front/vite.config.js` from Task 1 (its React plugin choice must be mirrored here)
- Produces: `yarn test` running all 157 tests; `yarn test --project node` and `yarn test --project jsdom` running each half

- [ ] **Step 1: Add the test dependencies at the root**

The root owns the test configuration, so the test dependencies live there. `front/` keeps only what it needs to build.

```bash
yarn add -D vitest@^4.1.10 jsdom@^30.0.1 @vitejs/plugin-react@^6.0.5 @testing-library/react@^16.3.2 @testing-library/jest-dom@^7.0.1
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.js` at the repo root:

```js
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// One config, two environments. Before this, the repo ran two separate Jest
// setups: a node/ESM one for .mjs backend tests and react-scripts' jsdom one
// for components. A test placed in the wrong tree silently never ran, which
// cost real debugging time. `test.projects` replaces the deprecated `workspace`
// file (deprecated since Vitest 3.2).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: [
            "__tests__/**/*.test.mjs",
            "slack-checker/__tests__/**/*.test.mjs",
          ],
        },
      },
      {
        plugins: [react()],
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

If Task 1 needed a JSX config escalation, apply the identical escalation to the `jsdom` project here. If Task 1 used plain `react()`, use plain `react()` here.

- [ ] **Step 3: Point the root test script at Vitest and delete the Jest config**

In root `package.json`, change the `test` script to:

```json
    "test": "vitest run",
```

Vitest is ESM-native, so `--experimental-vm-modules` is no longer needed — that flag existing is what the migration removes.

Also fix `postinstall`, which currently mixes npm into an otherwise-yarn project:

```json
    "postinstall": "cd front && yarn install && yarn build",
```

Then:

```bash
git rm jest.config.js
```

- [ ] **Step 4: Update the jest-dom setup import**

Replace the import line in `front/src/setupTests.js`:

```js
// jest-dom adds custom matchers for asserting on DOM nodes, e.g.
// expect(element).toHaveTextContent(/react/i)
// https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom/vitest";
```

The `/vitest` entry point registers the matchers with Vitest's `expect`. If it fails to resolve, fall back to the bare `import "@testing-library/jest-dom";` and note which you used in your report.

- [ ] **Step 5: Run everything and check the count**

```bash
yarn test 2>&1 | tail -15
```

Expected: **157 tests passed**, across 13 test files.

The number is the assertion. A project whose `include` pattern matches nothing reports success with zero tests, which is exactly the silent failure this migration exists to eliminate. If you see 144, the jsdom project matched nothing. If you see 13, the node project matched nothing.

- [ ] **Step 6: Prove each project independently**

```bash
yarn test --project node 2>&1 | grep -E "Tests:"
yarn test --project jsdom 2>&1 | grep -E "Tests:"
```

Expected: `144 passed` and `13 passed` respectively. Both must be non-zero.

- [ ] **Step 7: Establish whether any JSX config is load-bearing**

If you added a JSX-related key to either config in Task 1 Step 6 or Task 2 Step 2, remove it now and re-run `yarn test`. It must fail. Restore it and confirm the tests pass again, and confirm `git diff` on the config file is empty relative to what you committed.

If you added nothing — the expected outcome — state that plainly in your report: `@vitejs/plugin-react` handled JSX in `.js` with no extra configuration.

A config key whose removal changes nothing must be deleted. Report which case applies.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.js package.json yarn.lock front/src/setupTests.js
git add -u jest.config.js
git commit -m "test: consolidate both Jest runners onto one Vitest config

The repo ran two Jest setups -- a node/ESM one for .mjs backend tests and
react-scripts' jsdom one for components -- so a test placed in the wrong
tree silently never ran. One vitest.config.js with two projects runs all
157 tests in a single command.

This also fixes the failure that prompted the migration: CRA 5 pinned
Jest 27, whose resolver ignores exports maps, so a frontend test could not
resolve react-router-dom. Vitest is ESM-native and honors exports."
```

---

### Task 3: Update the documentation

`CLAUDE.md` currently instructs contributors to use commands that no longer exist. Leaving it stale would send the next person down a removed path.

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the commands established in Tasks 1 and 2
- Produces: nothing downstream

- [ ] **Step 1: Locate the lines that need changing**

```bash
grep -n "yarn test\|react-scripts\|frontend dev server\|yarn build\|yarn both" CLAUDE.md
```

Expected hits: lines 9, 10, 16, 19, 27, 56. Read each in context before editing.

- [ ] **Step 2: Update the testing line**

Line 27 currently reads:

```markdown
- `yarn test` - Run tests
```

Replace it with:

```markdown
- `yarn test` - Run all 157 tests (backend + frontend) via Vitest
- `yarn test --project node` - Backend `.mjs` suites only
- `yarn test --project jsdom` - Frontend component tests only
```

- [ ] **Step 3: Note the single-runner change in the frontend testing section**

The section around lines 16-19 describes building and testing via the backend. That workflow is unchanged and must be kept. Add one line to it recording that frontend component tests now run from the repo root via `yarn test`, not from inside `front/` — previously they required `cd front && yarn test`, and a test placed in the wrong tree silently never ran.

- [ ] **Step 4: Replace any dev-server reference with Vite**

Line 19 and line 56 refer to "the frontend dev server". That server is now Vite rather than `react-scripts`; the guidance to prefer `cd front && yarn build` plus the backend at `http://localhost:4001` is unchanged and must stay. Update only the naming where `react-scripts` is implied, and leave the recommendation itself intact.

Do not restructure the file or rewrite sections that are still accurate.

- [ ] **Step 3: Verify every command in the file actually works**

For each command the updated `CLAUDE.md` names, run it and confirm it succeeds. Do not include a command you have not run.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Vite and the unified Vitest suite"
```

---

## Verification checklist

After all three tasks, all of the following must hold:

- [ ] `yarn test` → 157 passed
- [ ] `yarn test --project node` → 144 passed
- [ ] `yarn test --project jsdom` → 13 passed
- [ ] `cd front && yarn build` → succeeds, `front/build/index.html` exists
- [ ] `yarn dev` → app loads at `http://localhost:4001`, `/admin` renders the student table with a Grade column
- [ ] `git diff main --stat -- app.js` → empty (the server was never touched)
- [ ] `grep -rn "react-scripts" package.json front/package.json` → no matches
- [ ] `jest.config.js` does not exist
- [ ] `git status --short` → shows only `participation-tooltip.png`, the user's untracked file

## Out of scope

Do not do these, even if tempting while in the files:

- Playwright or any end-to-end testing — it has its own spec
- Adding CI
- Collapsing `front/` into the root package, or introducing yarn workspaces
- Renaming `.js` files to `.jsx`
- Upgrading d3 from v5, or any other dependency not required by this migration
- Removing the now-inert `eslintConfig` block from `front/package.json`
- Any change to application behavior
