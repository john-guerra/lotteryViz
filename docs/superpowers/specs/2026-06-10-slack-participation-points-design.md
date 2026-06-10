# Slack Participation Points — Design Spec

Date: 2026-06-10
Status: Approved design (pending spec review) → next: writing-plans

## Context & Motivation

This work started from two operational chores and grew into a small system:

1. **MCP scope cleanup.** `canvas-lms` and `canvas-extras` MCP servers are configured at **User scope**, so they load in every project (wasting context in projects that never touch Canvas). The unused `claude.ai Figma` integration should be removed. Goal: Canvas MCP becomes **project-local** to `lotteryv2`, with the `CANVAS_API_TOKEN` loaded from an env var (never committed).

2. **Current-semester support + Slack participation workflow.** It's Summer 2026, but `canvas-config.json` only knows Spring 2026 courses. Beyond fixing that one entry, the instructor wants to **stop hand-managing this every term**: scan Slack for the posts where they offer "participation/lottery points for responding," award responders, never double-award, surface the history in Canvas, and get help reconciling config when a new semester starts.

The lottery pipeline today: `slack-checker/check-responses.mjs` inserts grade docs into Mongo (`lottery_<course>.grades`); `export-lottery-to-canvas.mjs` reads them back, computes percentile grades, and pushes to Canvas. This spec extends both ends.

## Goals

- Canvas MCP project-scoped; token via env var; Figma removed.
- Discover the instructor's point-offer posts in Slack **semantically and locally** (no paid API), learning the instructor's phrasing over time.
- Award responders with robust **dedup** (never award the same post twice; allow topping-up new responders).
- A single **interactive menu** for the whole workflow; existing CLI flags still work.
- Surface participation in Canvas grade comments (readable post + "N of M threads" rate).
- A **semester-setup helper** that detects config drift (Mongo vs `canvas-config.json` vs Slack config) and helps populate new-course config.

## Non-Goals (YAGNI)

- No GUI/web UI (CLI only).
- No paid LLM/API usage.
- No negative-example training for the classifier (positive examples only for now).
- No automatic posting to Slack.

---

## Settled facts (from exploration)

- Current course: **CS5610 WebDev Summer 2026**, Canvas id **249954**; Participation assignment group **664838**; existing "Lottery Grade" assignment **3196231**. Mongo `lottery_webdev_summer_2026` has 120 grade docs.
- Export resolves the DB via `db/myDB.js` as `lottery_${course}` — **no `dbName` change needed** for export.
- `getAvailableCourses()` (`matcher.mjs:23`) already returns `webdev_summer_2026`.
- Slack uses a **bot token** (`SLACK_BOT_TOKEN`); `search.messages` is unavailable → must use `conversations.history`; the bot must be a member of scanned channels.
- `node` engine `>18`; project is ESM (`"type": "module"`); tests via Jest (`yarn test`).

---

## Phase 0 — MCP rescope + current-semester config (mechanical)

**0a. Remove global/account MCP entries**
```
claude mcp remove canvas-lms -s user
claude mcp remove canvas-extras -s user
claude mcp remove "claude.ai Figma" -s claudeai
```

**0b. Shell env (out of git)** — append to `~/.zshrc` (value reused from the gitignored `.env`):
```
export CANVAS_API_TOKEN="…"          # same token already in .env
export CANVAS_DOMAIN="northeastern.instructure.com"
```
Claude Code expands `${VAR}` in `.mcp.json` from the launching shell's environment; the var merely existing costs nothing, while the project-scoped server definition controls where the MCP loads.

**0c. Create `/Users/aguerra/workspace/lotteryv2/.mcp.json`** (committed; no secret, only `${VAR}` refs):
```json
{
  "mcpServers": {
    "canvas-lms": {
      "command": "npx",
      "args": ["-y", "canvas-mcp-server@2.2.3"],
      "env": { "CANVAS_API_TOKEN": "${CANVAS_API_TOKEN}", "CANVAS_DOMAIN": "${CANVAS_DOMAIN}" }
    },
    "canvas-extras": {
      "command": "node",
      "args": ["/Users/aguerra/workspace/aiCoding_Course/tools/canvas-extras-mcp/index.js"],
      "env": { "CANVAS_API_TOKEN": "${CANVAS_API_TOKEN}", "CANVAS_DOMAIN": "${CANVAS_DOMAIN}" }
    }
  }
}
```

**0d. Add current course to `canvas-config.json`** (gitignored):
```json
"webdev_summer_2026": {
  "canvasId": 249954,
  "lotteryAssignmentId": 3196231,
  "accumulatedPointsAssignmentId": null,
  "participationGroupId": 664838
}
```

**Verify:** new shell → `claude mcp get canvas-lms` shows Scope: Project, Connected; Figma absent. `yarn export_to_canvas -- --course webdev_summer_2026 --dry-run` prints a grade preview, no writes.

---

## Phase 1 — Ledger + interactive menu + dedup + Canvas enrichment

The backbone phase; no embeddings yet. Delivers dedup, history, and Canvas surfacing using the existing thread-URL award flow.

### Config: `slack-checker/config.json` (gitignored, course-keyed)
```json
{
  "webdev_summer_2026": {
    "channels": ["#general", "#announcements", "#classchat"],
    "semesterStart": "2026-05-04",
    "semesterEnd": "2026-08-21",
    "instructorSlackId": "U0123ABCD",
    "seedOfferPhrases": [
      "I'll give participation points to everyone who responds in this thread",
      "Lottery points if you reply here before tomorrow"
    ]
  }
}
```
A `loadScanConfig(course)` helper reads it; missing course → guided by the Phase 3 setup helper (Phase 1 can fall back to prompting).

### Ledger: `slack-checker/ledger.mjs` (new) → Mongo `lottery_<course>.slack_posts`
Doc shape (the system's backbone — dedup record, status source, and embeddings training set):
```js
{
  threadTs,        // canonical key (Slack parent ts)
  url,             // permalink
  channel,         // "#general"
  text,            // original post text (reference example for embeddings)
  source,          // "scan" | "manual" | "award"
  awarded,         // boolean
  points,          // points awarded (if awarded)
  studentCount,    // # roster matches awarded (if awarded)
  awardedAt,       // Date (if awarded)
  addedAt          // Date the doc was first recorded
}
```
Exports: `recordPost(course, doc)` (upsert by `threadTs`), `markAwarded(course, threadTs, {points, studentCount})`, `isAwarded(course, threadTs)`, `getPosts(course)`, `getReferenceTexts(course)` (texts of all confirmed-offer docs, used by Phase 2).

### Menu: refactor `slack-checker/check-responses.mjs`
When run with no required args **and** `process.stdin.isTTY`, show a top-level menu (built-in `readline`, reusing the existing `confirm()` style). Existing flags/positional args bypass the menu unchanged; non-TTY + missing args still prints usage and exits.

```
yarn check-slack
  1) Scan for new point-offer posts this semester   (Phase 2)
  2) Award points from a thread URL
  3) Add post(s) by URL (teach the scanner; optional award)
  4) List posts & grading status
  5) Semester setup / fix config                    (Phase 3)
```

- **(2) Award from URL** — existing flow, now prompting for course (numbered list from `getAvailableCourses()`), points (default 2), hours window (default 24); on award, calls `recordPost(..., {source:'award', awarded:true})` + `markAwarded`.
- **(3) Add by URL** — fetch parent message via `getParentMessage`, store `recordPost(..., {source:'manual', awarded:false})` so its text joins the reference set; then offer to award (reuses the award flow).
- **(4) List & status** — table from `getPosts(course)`: date, channel, snippet, awarded?, points, #students, awardedAt. (Satisfies "list posts with info on if/how graded.")

### Dedup behavior
- Award flow checks `isAwarded`; if already awarded, default = **skip** with a message.
- A **"top-up new responders"** option re-runs a thread but only awards responders with no existing grade doc for that thread (match on the thread URL in `reason` + roster name), then updates `studentCount`.

### Canvas enrichment: `export-lottery-to-canvas.mjs`
`formatPointHistory` (and the per-student comment builder) loads the ledger for the course and:
- Maps each Slack-thread grade entry's URL → readable `Mon D (#channel): "snippet" +pts`.
- Adds a summary line: `Slack participation: <responded> of <totalOfferPosts> threads`, where `totalOfferPosts` = count of `awarded` ledger docs for the course and `responded` = distinct awarded threads the student has a grade for.

**Verify:** menu navigable; award→ledger doc appears; re-award is skipped; `--dry-run` export shows enriched comments + participation rate; `slack-checker/__tests__` pass.

---

## Phase 2 — Semantic scan (local embeddings)

### `slack-checker/embeddings.mjs` (new)
- `@huggingface/transformers` (transformers.js v3); model `Xenova/all-MiniLM-L6-v2` (~23MB, downloaded/cached on first run, then offline). Lazy singleton pipeline.
- `embed(texts) → vectors`, `cosineSim(a,b)`, and `classifyOffers(messages, referenceTexts, threshold=~0.55) → [{message, score}]` (max cosine vs any reference text).

### `slack-api.mjs` additions
- `listChannels()` → `conversations.list` (public channels), name→ID map.
- `getChannelHistory(channelId, {oldest, latest})` → paginated `conversations.history` (top-level messages).

### Scan flow (menu item 1)
1. `loadScanConfig(course)` → channels, semester window, `instructorSlackId`.
2. Resolve channel names → IDs; for each, `getChannelHistory(oldest=semesterStart, latest=semesterEnd)`.
3. Pre-filter to `msg.user === instructorSlackId` (if set) to cut volume cheaply; else all top-level messages.
4. `referenceTexts = getReferenceTexts(course) ∪ config.seedOfferPhrases` (cold-start seed; grows as posts are awarded/added).
5. `classifyOffers(...)` → candidates above threshold, sorted by score.
6. Cross-reference ledger → mark ✓already-awarded; present list; user selects → award flow (Phase 1).

**Error handling:** channel not a member → warn & skip that channel; model download failure → clear message, fall back to manual award; empty reference set + no seed → instruct to add posts by URL first.

**Verify:** scan a real channel/window; confirm known offer-posts surface and an unrelated message does not; already-awarded posts are marked; selecting one reaches the award preview.

---

## Phase 3 — Semester-setup helper (config drift detector)

Menu item 5. Reconciles three sources of truth:
- Mongo: list DBs matching `lottery_*` that have a non-empty `grades` collection.
- `canvas-config.json` course keys.
- `slack-checker/config.json` course keys.

For a course present in Mongo but missing/incomplete in config:
1. List the instructor's Canvas courses via the REST API (reuse the export script's `canvasRequest`; extract a shared `lib/canvas.mjs` if convenient), match by name/term, propose `canvasId` + participation group + lottery assignment.
2. Prompt for `channels`, `semesterStart/End`, and `instructorSlackId` (offer to detect the Slack ID).
3. Write the proposed entries to `canvas-config.json` and `slack-checker/config.json` after confirmation.

**Verify:** with `webdev_summer_2026` present in Mongo but removed from config, the helper detects it and proposes correct entries.

---

## Testing strategy

- **Pure logic, unit-tested (Jest):** ledger doc shaping/upsert keying, dedup decision, participation-rate computation, cosine similarity, config drift diff. Follow existing `slack-checker/__tests__` and `__tests__/canvas-matching.test.mjs` patterns; embeddings model and Slack/Mongo I/O are mocked or factored behind thin adapters.
- **Interactive I/O (readline menus) and live Slack/Canvas calls:** verified manually per the per-phase Verify steps.

## Open defaults (chosen; change if undesired)
- Cosine threshold default ~0.55 (tunable in config).
- Embedding model `Xenova/all-MiniLM-L6-v2`.
- `slack-checker/config.json` as the Slack-side config home (separate from `canvas-config.json`); both gitignored.
- Menu triggers only on missing-args + TTY; flags preserved for scripting.
