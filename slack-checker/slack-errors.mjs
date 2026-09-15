// Translates @slack/web-api error codes into messages an operator can act on.
//
// Kept separate from slack-api.mjs on purpose: that module reads
// SLACK_BOT_TOKEN and calls process.exit(1) at import time, so importing it
// from a test would kill the test process. This module is pure.
//
// The distinction that matters here, established by probing the live API:
//
//   public channel, bot is a member    -> ok
//   public channel, bot is NOT member  -> not_in_channel
//   private channel (no groups:read)   -> channel_not_found
//   id from another workspace          -> channel_not_found
//
// So `channel_not_found` means "this token cannot see that conversation at
// all" -- a scope or workspace problem. It specifically does NOT mean the bot
// needs inviting; that case has its own code. An earlier version of this
// advice said "make sure the bot is added to the channel" for
// channel_not_found, which sent debugging in exactly the wrong direction.

/** Message builders keyed by Slack's error code. */
const HINTS = {
  channel_not_found: ({ where, workspace }) =>
    `Slack cannot see that conversation${where}. This is not a channel-membership problem ` +
    `(that case reports not_in_channel). It means the id does not resolve for this token: ` +
    `either the thread lives in a different workspace than SLACK_BOT_TOKEN` +
    `${workspace ? ` (the token belongs to ${workspace})` : ""}, or it is a private channel/DM ` +
    `and the token lacks groups:read + groups:history (im:history for DMs).`,

  not_in_channel: ({ where, botName }) =>
    `The bot is not a member of that channel${where}. ` +
    `Invite it from inside the channel with: /invite @${botName || "<your bot>"}`,

  thread_not_found: ({ where }) =>
    `No thread found at that timestamp${where}. Check the URL — copying the link to a ` +
    `REPLY rather than the thread's first message is the usual cause.`,

  missing_scope: ({ where, needed }) =>
    `The bot token is missing the ${needed || "required"} scope${where}. ` +
    `Add it at api.slack.com/apps, then REINSTALL the app to the workspace — ` +
    `scope changes do not take effect until the app is reinstalled.`,
};

/**
 * Map a Slack SDK error to one carrying actionable guidance.
 *
 * Returns the original error untouched when it is not a recognized Slack API
 * failure, so genuine transport errors and unhandled codes (ratelimited, etc.)
 * keep their stack and are never masked by a misleading rewrite.
 *
 * Returns rather than throws so callers decide control flow.
 *
 * @param {Error} error - error thrown by @slack/web-api
 * @param {{channelId?: string, workspace?: string, botName?: string}} [context]
 * @returns {Error} a new Error with guidance, or the original error
 */
export function describeSlackError(error, context = {}) {
  const code = error?.data?.error;
  const hint = code && HINTS[code];
  if (!hint) return error;

  const where = context.channelId ? ` (${context.channelId})` : "";
  const translated = new Error(hint({ ...context, where, needed: error.data?.needed }));
  // Preserve the raw code and original error for callers that branch on them.
  translated.slackError = code;
  translated.cause = error;
  return translated;
}
