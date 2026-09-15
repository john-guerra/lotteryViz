// Maps a course to the Slack workspace it is taught in.
//
// Each course names the .env variable holding its bot token, via `tokenEnv` in
// slack-checker/config.json:
//
//   "aicoding_sj_fall_2026": { "tokenEnv": "SLACK_BOT_TOKEN_aicoding_sj_fall_2026", ... }
//
// The token VALUE stays in .env; config.json only names it. Courses predating
// per-course tokens omit `tokenEnv` and fall back to SLACK_BOT_TOKEN.
import { loadAllScanConfig } from "./config.js";
import { createSlackApi } from "./slack-api.mjs";

/** Variable used by courses that do not name their own. */
export const DEFAULT_TOKEN_ENV = "SLACK_BOT_TOKEN";

/**
 * Which env var holds this course's bot token.
 * @param {string} course
 * @param {object} config - parsed config.json, keyed by course
 * @returns {string} env var name
 */
export function resolveTokenEnv(course, config) {
  const entry = config[course];
  if (!entry) {
    throw new Error(
      `No scan config for "${course}". Add it to slack-checker/config.json.`
    );
  }
  return entry.tokenEnv || DEFAULT_TOKEN_ENV;
}

/**
 * Resolve a course's bot token from the environment.
 *
 * Names both the course and the variable on failure: with one token per course
 * an error saying only "token not set" leaves the operator guessing which of
 * several is broken.
 *
 * @param {string} course
 * @param {object} config - parsed config.json
 * @param {object} env - process.env (injected for tests)
 * @returns {{tokenEnv: string, token: string}}
 */
export function resolveToken(course, config, env) {
  const tokenEnv = resolveTokenEnv(course, config);
  const token = (env[tokenEnv] || "").trim();
  if (!token) {
    throw new Error(
      `Course "${course}" uses the Slack token in ${tokenEnv}, but ${tokenEnv} is ` +
        `not set (or is empty) in .env. Install the Slack app in that course's ` +
        `workspace, copy its Bot User OAuth Token, and add ${tokenEnv}=xoxb-... to .env.`
    );
  }
  return { tokenEnv, token };
}

/**
 * Build a course → Slack API resolver.
 *
 * Clients are memoized by TOKEN rather than by course, so several courses
 * sharing one workspace share a single client (and one set of rate limits).
 *
 * @param {{config?: object, env?: object, factory?: Function}} [deps]
 * @returns {(course: string) => object} resolver returning a slack-api object
 */
export function createCourseApiResolver({
  config = loadAllScanConfig(),
  env = process.env,
  factory = createSlackApi,
} = {}) {
  const byToken = new Map();
  return function getSlackApiForCourse(course) {
    const { token } = resolveToken(course, config, env);
    if (!byToken.has(token)) byToken.set(token, factory(token));
    return byToken.get(token);
  };
}

// Process-wide default resolver. Reads config.json and process.env on first
// use, so importing this module has no side effects and a missing token is a
// normal throw at the call site rather than an import-time process.exit().
let defaultResolver = null;

/**
 * Get the Slack API client for a course, using the ambient config/env.
 * @param {string} course
 * @returns {object} slack-api object bound to that course's workspace
 */
export function getSlackApiForCourse(course) {
  if (!defaultResolver) defaultResolver = createCourseApiResolver();
  return defaultResolver(course);
}

/** Drop cached clients (used by tests and after a config/.env change). */
export function resetSlackApiCache() {
  defaultResolver = null;
}
