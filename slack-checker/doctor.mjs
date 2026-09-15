// Verifies that every configured course can actually reach its Slack workspace.
//
// Exists because a misconfigured course used to be invisible until a scan or an
// award failed, and the failure it produced (`channel_not_found`) does not by
// itself say whether the token is wrong, the workspace is wrong, or the bot was
// never invited. This checks all three up front, per course.
//
// Pure report-building is kept separate from I/O so it can be tested without a
// network: checkCourse() takes the course→api resolver as a parameter.
import { loadAllScanConfig } from "./config.js";
import { getSlackApiForCourse } from "./slack-workspace.mjs";

/**
 * Check one course end to end: token resolves, token authenticates, and every
 * configured channel is both visible and joined.
 *
 * Never throws -- a broken course is data, not an exception, so one bad course
 * cannot hide the state of the others.
 *
 * @param {string} course
 * @param {object} config - parsed config.json
 * @param {(course: string) => object} resolver - course → slack-api object
 * @returns {Promise<object>} report
 */
export async function checkCourse(course, config, resolver) {
  const entry = config[course] || {};
  const base = { course, tokenEnv: entry.tokenEnv || "SLACK_BOT_TOKEN", channels: [] };

  let api;
  try {
    api = resolver(course);
  } catch (error) {
    return { ...base, status: "token-missing", error: error.message };
  }

  let identity;
  try {
    identity = await api.whoAmI();
  } catch (error) {
    return { ...base, status: "auth-failed", error: error.message };
  }

  let visible;
  try {
    visible = await api.listChannelsDetailed();
  } catch (error) {
    return { ...base, ...identity, status: "auth-failed", error: error.message };
  }

  const channels = (entry.channels || []).map((name) => {
    const found = visible.get(name);
    if (!found) return { name, status: "not-found" };
    return { name, id: found.id, status: found.isMember ? "ok" : "not-a-member" };
  });

  const healthy = channels.every((c) => c.status === "ok");
  return { ...base, ...identity, status: healthy ? "ok" : "channel-issues", channels };
}

/**
 * Check every course in the config, sequentially so output order is stable.
 * @param {{config?: object, resolver?: Function}} [deps]
 * @returns {Promise<object[]>} one report per course
 */
export async function runDoctor({
  config = loadAllScanConfig(),
  resolver = getSlackApiForCourse,
} = {}) {
  const reports = [];
  for (const course of Object.keys(config)) {
    reports.push(await checkCourse(course, config, resolver));
  }
  return reports;
}

/** Per-channel remediation, phrased as the next action to take. */
const CHANNEL_NOTE = {
  ok: "ok",
  "not-a-member": "bot not in channel — run /invite in it",
  "not-found": "not found in this workspace — wrong workspace, private, or renamed",
};

/**
 * Render reports as operator-readable text.
 * @param {object[]} reports
 * @returns {string}
 */
export function formatReport(reports) {
  const lines = [];
  for (const r of reports) {
    if (r.status === "token-missing") {
      lines.push(`✗ ${r.course}`);
      lines.push(`    no token — set ${r.tokenEnv} in .env`);
      lines.push("");
      continue;
    }
    if (r.status === "auth-failed") {
      lines.push(`✗ ${r.course}  [${r.tokenEnv}]`);
      lines.push(`    token rejected by Slack: ${r.error}`);
      lines.push("");
      continue;
    }

    const mark = r.status === "ok" ? "✓" : "!";
    const team = r.team ? ` (${r.team})` : "";
    lines.push(`${mark} ${r.course}  [${r.tokenEnv}] → ${r.workspace}${team}`);
    for (const c of r.channels) {
      const note = CHANNEL_NOTE[c.status] || c.status;
      lines.push(`    ${c.status === "ok" ? "✓" : "✗"} ${c.name.padEnd(16)} ${note}`);
    }
    if (r.channels.length === 0) lines.push("    (no channels configured)");
    lines.push("");
  }
  return lines.join("\n");
}
