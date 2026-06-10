# Slack Participation Points — GUI Implementation Handoff

> **Audience:** a developer/AI agent with **no prior context** on this repo, tasked with building a **web GUI** for the "Slack participation points" workflow. This document is self-contained. Read it fully before coding.

## 1. What this feature is

The instructor posts messages in Slack offering "participation points" or "lottery points" to students who reply in a thread (e.g. *"reply here and you all get 2 lottery points"*). Those points feed a "lottery" grade that is later pushed to Canvas. Today this is done via a **CLI** (`yarn check-slack`). The goal of this task is to **rebuild the same workflow as a GUI** inside the project's existing React app, reusing the already-built, already-tested backend logic.

The end-to-end pipeline:
1. **Scan** chosen Slack channels over the semester window and use a **local sentence-embedding model** to find the instructor's point-offer posts (it learns the instructor's phrasing from past posts).
2. **Award** points to the responders of a chosen post → inserts grade docs into MongoDB. Robust **dedup** so a post is never double-awarded.
3. **Track** every awarded/added post in a ledger (Mongo `slack_posts` collection) — also the training set for the scanner.
4. **Surface** participation when grades are exported to Canvas (already implemented in the CLI export script).

## 2. Why a GUI (and what it should feel like)

The CLI works but the workflow is visual: a **list of discovered candidate posts** with match-score, channel, date, snippet, and an "already awarded" badge; **checkboxes** to pick which to award; a **preview** of matched/unmatched responders before committing; and a **status table** of all known posts. That's a much better fit for a web page than terminal prompts.

## 3. Tech stack & architecture (existing app)

- **Backend:** Express, ESM (`"type": "module"` in root `package.json`). Entry `bin/www.js`, routes in `routes/index.js` (an `express.Router()`). Runs on **port 4001**. Serves the built frontend from `front/build`. Start with `yarn dev` (no DB backup) or `yarn start` (with backup).
- **Frontend:** React 18 (Create React App / `react-scripts`), `react-router-dom` v7, `d3` v5. Lives in `front/`. Source in `front/src/` (note existing dirs: `pages/`, `components/`, `context/`, plus `App.js`, `LotteryChart.js`). Dev server proxies to `http://localhost:4001` (see `front/package.json` `"proxy"`). **Build with `cd front && yarn build`**, then it's served by the backend at `http://localhost:4001` — this is the recommended test loop (single server).
- **Database:** local MongoDB (`mongodb://localhost:27017`). Per-course database named `lottery_<course>` with collections `grades` and (new) `slack_posts`.
- **Secrets:** `.env` (gitignored) holds `SLACK_BOT_TOKEN`, `CANVAS_TOKEN`, `CANVAS_DOMAIN`, `MONGO_URL`. **All Slack/Canvas calls happen server-side** — never expose tokens to the browser.
- **Security pattern already in use:** mutating endpoints in `routes/index.js` reject non-localhost requests (`if (req.ip !== "127.0.0.1") return;`). This app is meant to run on the instructor's machine. Apply the same guard to any new mutating endpoints (award, add, config write).
- **Course config / roster:** `front/src/students.mjs` (gitignored) exports `classes` — an object keyed by course (e.g. `webdev_summer_2026`) with `{ roster: ["Last, First", ...], medianAdjustment: number }`, and `dbName`. `getAvailableCourses()` returns the course keys.

## 4. What is ALREADY built (reuse it — do not rewrite)

All of this is implemented, tested (96 Jest tests), and committed on branch `feature/slack-participation-points`. The GUI should call this logic from new Express endpoints.

### `slack-checker/` modules
- **`ledger.mjs`** — Mongo I/O for `lottery_<course>.slack_posts`:
  - `recordPost(course, post)` — upsert by `threadTs`. Post shape: `{ threadTs, url, channel, text, source: "scan"|"manual"|"award", awarded: boolean, points?, studentCount?, awardedAt?, addedAt }`.
  - `markAwarded(course, threadTs, { points, studentCount })`
  - `isAwarded(course, threadTs)` → boolean
  - `getPosts(course)` → all ledger docs (newest first)
  - `getAwardedPosts(course)` → only awarded
  - `getReferenceTexts(course)` → texts of all recorded posts (classifier training set)
- **`ledger-format.mjs`** — pure helpers (unit-tested): `extractThreadUrl(reason)`, `truncateSnippet(text, max)`, `computeParticipation(entries, awardedPosts) → {responded, total}`, `enrichPointHistory(entries, postsByUrl) → string`.
- **`embeddings.mjs`** — local, free, offline classifier using `@huggingface/transformers` (model `Xenova/all-MiniLM-L6-v2`, ~23MB, cached after first download):
  - `embed(texts) → number[][]` (mean-pooled, L2-normalized)
  - `cosineSim(a,b)`, `maxCosineToAny(vec, refVecs)` (pure, unit-tested)
  - `classifyOffers(messages, referenceTexts, threshold=0.55) → [{message, score}]` sorted desc, ≥ threshold.
- **`slack-api.mjs`** — wraps `@slack/web-api` (bot token). NOTE: **bot tokens cannot use `search.messages`** — that's why scanning reads channel history.
  - `parseSlackUrl(url) → { channelId, messageTs }`
  - `getParentMessage(channelId, ts)`, `getThreadReplies(channelId, ts)`, `getUserDisplayNames(userIds) → Map`
  - `listChannels() → Map("#name" → id)`, `getChannelHistory(channelId, {oldest, latest}) → messages[]` (paginated, top-level only), `getPermalink(channelId, ts) → url`
- **`matcher.mjs`** — fuzzy name matching: `matchNames(slackNames, roster) → { matched:[{slackName, rosterName, confidence}], unmatched }`, `loadStudentRoster(course)`, `getAvailableCourses()`, `MIN_CONFIDENCE`.
- **`scan.mjs`** — orchestrator:
  - `scanOffers(course, slack) → { candidates, embeddedCount, channelsScanned, noReferences? }` where `slack = { listChannels, getChannelHistory, getPermalink }`. Each candidate: `{ channel, channelId, ts, text, score, alreadyAwarded, inLedger }`.
  - pure helpers `toUnixSeconds(date)`, `buildReferenceTexts(ledgerTexts, seedPhrases)`.
- **`config.js`** — `loadScanConfig(course)` / `loadAllScanConfig()` read `slack-checker/config.json` (gitignored). Per-course shape: `{ channels: ["#general", ...], semesterStart: "YYYY-MM-DD", semesterEnd: "YYYY-MM-DD", instructorSlackId: "", seedOfferPhrases: [...], offerThreshold?: number }`. A committed `config.example.json` documents the shape.
- **`check-responses.mjs`** — the current CLI. Contains `awardFromThread(options)` and an interactive menu. **`awardFromThread` is CLI-coupled** (it does `console.log` and a readline confirm). See §6 — you'll extract a headless version for the API.

### Canvas export (separate concern, already done)
`export-lottery-to-canvas.mjs` (run via `yarn export_to_canvas -- --course <c> [--dry-run]`) reads the `grades` collection, computes **percentile-based** grades, and pushes them to Canvas. It already enriches the per-student Canvas comment with the Slack ledger (readable post + "N of M point-offer threads"). Course→Canvas-ID mapping is in `canvas-config.json` (gitignored). **You can leave Canvas export as a CLI**, or optionally add a "Export to Canvas" button later (out of scope for v1 unless desired).

### Data model
- `lottery_<course>.grades`: docs `{ name, grade, course, reason, date, timestamp }`. Slack awards set `reason = "Responded to Slack thread: <url>"`.
- `lottery_<course>.slack_posts`: ledger, shape in `recordPost` above.

## 5. GUI scope (what to build)

Add a **"Participation" section** to the React app (a new route/page using the existing `react-router-dom` setup and `pages/`/`components/` structure). A course selector at the top drives everything. Five workflows (mirror the CLI menu):

1. **Scan for offer-posts** — button → calls scan endpoint (slow: first call loads the model + pulls Slack history; show a spinner / progress). Render results as a **ranked list/table**: match %, date, channel, snippet, and a badge for `alreadyAwarded` / `inLedger`. **Checkboxes** to select posts. Inputs for **points** (default 2) and **time window hours** (default 24). "Award selected" button.
2. **Award by URL** — paste a Slack thread URL → **preview** matched/unmatched responders (a dry-run) → "Confirm award" commits.
3. **Add post by URL (teach the scanner)** — paste URL → records the post as a reference example (so the classifier learns the instructor's phrasing). Optionally award too.
4. **Posts & status** — table of all ledger posts for the course: date, channel, snippet, awarded?, points, #students, when graded.
5. **Semester setup / config** *(Phase 3 — not yet built in CLI either)* — detect courses present in Mongo (`lottery_*` DBs with grades) but missing from `canvas-config.json` / `slack-checker/config.json`, and help populate channels, term dates, `instructorSlackId`, Canvas IDs. Can be a later milestone.

**Critical UX rule:** always **preview before writing**. The CLI had a dry-run + confirm; the GUI should show matched/unmatched responders and a count before any award is committed.

## 6. Required backend API (new endpoints in `routes/index.js` or a new router)

Wrap the existing modules. Suggested REST shape (all JSON; apply the localhost guard to mutating ones):

- `GET /api/participation/courses` → `getAvailableCourses()`.
- `GET /api/participation/scan?course=<c>` → `scanOffers(c, { listChannels, getChannelHistory, getPermalink })`. Returns `{ candidates, embeddedCount, channelsScanned, noReferences }`. (Slow; consider a longer client timeout or a job/polling pattern. v1 can be a single synchronous request with a spinner.)
- `GET /api/participation/posts?course=<c>` → `getPosts(c)` (ledger status table).
- `POST /api/participation/preview` → body `{ course, threadUrl, hours }` → **dry-run**: parse URL, fetch parent + replies, filter by hours, match names; return `{ matched, unmatched, parentText, cutoff }`. **No DB writes.**
- `POST /api/participation/award` → body `{ course, threadUrl, points, hours, topUp }` → commit: insert grade docs for matched responders, `recordPost` + `markAwarded` in the ledger (respect dedup unless `topUp`). Return `{ awarded, matched, unmatched, alreadyAwarded }`.
- `POST /api/participation/add-by-url` → body `{ course, threadUrl, award?, points?, hours? }` → `recordPost(..., source:"manual", awarded:false)`; if `award`, also run the award.
- *(Phase 3)* `GET /api/participation/config-drift`, `POST /api/participation/config` for semester setup.

### Important refactor for the API
`awardFromThread(options)` in `check-responses.mjs` currently prints to the console and uses a readline `confirm()`. **Extract its core into a headless, non-interactive service** (e.g. `slack-checker/award-service.mjs`) that returns structured data instead of logging/prompting, so both a `preview` (dry-run) and `award` (commit) endpoint can call it. The pieces to factor out (already present in `awardFromThread`): `parseSlackUrl` → `getParentMessage` → compute `cutoffTs = parentTs + hours*3600` → `getThreadReplies` → filter `replyTs <= cutoffTs` → `getUserDisplayNames` → `matchNames(slackNames, roster)` → (commit only) `awardPoints` insert per matched + `recordPost`/`markAwarded`. Keep the existing CLI working (have the CLI call the new service too, or leave it as-is). The award→ledger key is the Slack `messageTs` (= `parseSlackUrl(threadUrl).messageTs`), which round-trips exactly through `getPermalink`.

## 7. Key decisions already locked in (honor these)
- **Local embeddings only — no paid LLM API.** transformers.js / `all-MiniLM-L6-v2`, offline after first download.
- **The classifier learns from the instructor's own posts** — reference set = ledger post texts (`getReferenceTexts`) + `seedOfferPhrases` from config. Empty reference set → `noReferences` (prompt the user to add a post by URL or seed phrases).
- **Dedup ledger in Mongo** (`slack_posts`), keyed by `threadTs`. Already-awarded posts still appear in scan results, flagged — that's intentional (good training data; user skips them).
- **Config-driven** channels + semester window per course (`slack-checker/config.json`).
- **The Slack bot must be a member** of any channel you scan/read (else `conversations.history` fails — handle gracefully and tell the user).
- **Threshold** `offerThreshold` (default 0.55) is tunable in config; expose it in the setup UI if convenient.

## 8. Suggested build order
1. Extract the headless award service (§6) + a tiny test; keep CLI green (`yarn test` = 96 tests).
2. Add the read endpoints (`courses`, `posts`, `scan`) and a minimal React "Participation" page that lists scan candidates for a course.
3. Add `preview` + `award` endpoints and the award UI (checkboxes, points/hours, preview modal, commit).
4. Add `add-by-url` and the status table.
5. (Later) Phase 3 semester-setup/config-drift UI.

## 9. Verification
- Backend: `yarn dev`; hit the new endpoints with `curl`/the browser. Confirm a scan returns ranked candidates; a `preview` shows matched/unmatched without writing; an `award` writes grade docs + a `slack_posts` row and is idempotent (re-award blocked unless top-up).
- Frontend: `cd front && yarn build`, then load `http://localhost:4001`. Walk the 5 workflows.
- Keep the existing Jest suite green (`yarn test`). **Back up Mongo first** (`yarn backup`) before testing awards.
- The Slack bot needs membership in the scanned channels; `slack-checker/config.json` must have the course's channels + term dates (+ optional `instructorSlackId` to scan only the instructor's posts; if blank, all messages in the window are scanned).

## 10. References (full design rationale & the CLI implementation)
- Design spec: `docs/superpowers/specs/2026-06-10-slack-participation-points-design.md`
- CLI plans: `docs/superpowers/plans/2026-06-10-slack-participation-points-phase0-1.md` and `…-phase2.md`
- Working CLI to mirror: `slack-checker/check-responses.mjs` (menu + `awardFromThread`), `slack-checker/scan.mjs`, `slack-checker/embeddings.mjs`.
- Branch with all of the above: `feature/slack-participation-points`.

**Bottom line:** the backend brain (scan, classify, match, award, dedup, ledger, Canvas enrichment) already exists and is tested. The GUI task is to (a) extract a headless award service, (b) expose ~6 JSON endpoints over the existing modules, and (c) build a React "Participation" page with a course selector, scan results list, preview-before-award, and a status table — reusing the project's existing Express + React + Mongo setup.
