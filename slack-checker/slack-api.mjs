// Thin wrapper over @slack/web-api, built per bot token.
//
// This module used to read SLACK_BOT_TOKEN at import time and build ONE
// module-level WebClient, which capped the whole process at a single Slack
// workspace. Courses are taught in different workspaces, so the token is now a
// parameter: `createSlackApi(token)` returns an object with these same method
// names. slack-workspace.mjs maps a course to its client; see that module.
//
// The import-time `process.exit(1)` on a missing token is also gone. It forced
// every consumer into a lazy `await import()` dance just to avoid killing the
// process (see routes/participation.js), and with per-course tokens there is no
// single variable whose absence is fatal. Missing tokens now surface per course,
// as a normal throw.
//
// NOTE: bot tokens cannot use search.messages -- that is why scanning reads
// channel history rather than searching.
import { WebClient } from "@slack/web-api";
import { describeSlackError } from "./slack-errors.mjs";

/**
 * Parse a Slack thread URL to extract channel ID and message timestamp.
 * Pure and workspace-independent, so it stays a module-level export rather
 * than a method on the client.
 * @param {string} url - Slack thread URL like https://team.slack.com/archives/C123ABC/p1234567890123456
 * @returns {{ channelId: string, messageTs: string }}
 */
export function parseSlackUrl(url) {
  // URL format: https://team.slack.com/archives/CHANNEL_ID/pTIMESTAMP
  // The timestamp in the URL is the message ts without the decimal
  const match = url.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/i);
  if (!match) {
    throw new Error(
      `Invalid Slack URL format: ${url}\nExpected format: https://team.slack.com/archives/CHANNEL_ID/pTIMESTAMP`
    );
  }

  const channelId = match[1];
  // Convert URL timestamp to Slack API timestamp format (add decimal before last 6 digits)
  const rawTs = match[2];
  const messageTs = rawTs.slice(0, -6) + "." + rawTs.slice(-6);

  return { channelId, messageTs };
}

/**
 * Build a Slack API wrapper bound to one bot token (i.e. one workspace).
 *
 * @param {string} token - xoxb- bot token
 * @param {{WebClientClass?: Function}} [options] - seam for tests
 * @returns {object} the same method names this module used to export
 */
export function createSlackApi(token, { WebClientClass = WebClient } = {}) {
  if (!token) throw new Error("createSlackApi requires a bot token.");
  const client = new WebClientClass(token);

  let identity = null;

  /**
   * Which workspace/bot THIS token belongs to, for error messages. Fetched
   * lazily and only from the error path, so the happy path costs no extra API
   * call. Failure to resolve it just means a less specific message.
   */
  async function getIdentity() {
    if (identity) return identity;
    try {
      const auth = await client.auth.test();
      identity = { workspace: new URL(auth.url).host, botName: auth.user };
    } catch {
      identity = {};
    }
    return identity;
  }

  /** Translate a Slack failure into actionable guidance naming this workspace. */
  async function explain(error, channelId) {
    return describeSlackError(error, { channelId, ...(await getIdentity()) });
  }

  /**
   * Identify the workspace behind this token. Unlike getIdentity() this
   * propagates failures, because the doctor needs to report them.
   * @returns {Promise<{workspace:string, team:string, botName:string}>}
   */
  async function whoAmI() {
    const auth = await client.auth.test();
    return {
      workspace: new URL(auth.url).host,
      team: auth.team,
      botName: auth.user,
    };
  }

  /**
   * Get all replies to a thread
   * @param {string} channelId - Slack channel ID
   * @param {string} messageTs - Parent message timestamp
   * @returns {Promise<Array>} - Array of reply messages
   */
  async function getThreadReplies(channelId, messageTs) {
    try {
      const result = await client.conversations.replies({
        channel: channelId,
        ts: messageTs,
      });

      if (!result.ok) {
        throw new Error(`Slack API error: ${result.error}`);
      }

      // First message is the parent, rest are replies
      return result.messages.slice(1);
    } catch (error) {
      throw await explain(error, channelId);
    }
  }

  /**
   * Get the parent message of a thread
   * @param {string} channelId - Slack channel ID
   * @param {string} messageTs - Parent message timestamp
   * @returns {Promise<Object>} - Parent message object
   */
  async function getParentMessage(channelId, messageTs) {
    let result;
    try {
      result = await client.conversations.replies({
        channel: channelId,
        ts: messageTs,
        limit: 1,
      });
    } catch (error) {
      // menuAddByUrl hits this before getThreadReplies, so an untranslated
      // error here is the first (and often only) thing the operator sees.
      throw await explain(error, channelId);
    }

    if (!result.ok || !result.messages || result.messages.length === 0) {
      throw new Error("Could not fetch parent message");
    }

    return result.messages[0];
  }

  /**
   * Get every name a user goes by, display name first. Students (often
   * international ones) set a nickname as display_name, which on its own
   * would hide the roster name that only real_name carries.
   * @param {string} userId - Slack user ID
   * @returns {Promise<string[]>} - Distinct non-empty names, never empty
   */
  async function getUserNames(userId) {
    try {
      const result = await client.users.info({ user: userId });

      if (!result.ok) {
        throw new Error(`Slack API error: ${result.error}`);
      }

      const user = result.user;
      const names = [user.profile.display_name, user.profile.real_name]
        .map((n) => n?.trim())
        .filter(Boolean);
      return names.length > 0 ? [...new Set(names)] : [user.name || userId];
    } catch {
      console.error(`Warning: Could not fetch user info for ${userId}`);
      return [userId];
    }
  }

  /**
   * Get a user's display name
   * @param {string} userId - Slack user ID
   * @returns {Promise<string>} - User's display name or real name
   */
  async function getUserDisplayName(userId) {
    return (await getUserNames(userId))[0];
  }

  /**
   * Get every name for multiple users, for matchNames
   * @param {string[]} userIds - Array of Slack user IDs
   * @returns {Promise<Map<string, string[]>>} - Map of userId to [display_name, real_name]
   */
  async function getUserDisplayNames(userIds) {
    const uniqueIds = [...new Set(userIds)];
    const nameMap = new Map();

    for (const userId of uniqueIds) {
      nameMap.set(userId, await getUserNames(userId));
    }

    return nameMap;
  }

  /**
   * List public channels as a Map of "#name" → channel id (paginated).
   * Requires the bot token to have channels:read.
   */
  async function listChannels() {
    const map = new Map();
    let cursor;
    do {
      const res = await client.conversations.list({
        types: "public_channel",
        limit: 1000,
        exclude_archived: true,
        cursor,
      });
      if (!res.ok) throw new Error(`Slack API error: ${res.error}`);
      for (const c of res.channels) map.set(`#${c.name}`, c.id);
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);
    return map;
  }

  /**
   * Like listChannels(), but keeps the membership flag the doctor needs to tell
   * "channel missing" apart from "bot was never invited".
   * @returns {Promise<Map<string, {id:string, isMember:boolean}>>}
   */
  async function listChannelsDetailed() {
    const map = new Map();
    let cursor;
    do {
      const res = await client.conversations.list({
        types: "public_channel",
        limit: 1000,
        exclude_archived: true,
        cursor,
      });
      if (!res.ok) throw new Error(`Slack API error: ${res.error}`);
      for (const c of res.channels) {
        map.set(`#${c.name}`, { id: c.id, isMember: Boolean(c.is_member) });
      }
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);
    return map;
  }

  /**
   * Fetch top-level messages in a channel within [oldest, latest] (unix
   * seconds, as strings). Paginated. The bot must be a member of the channel.
   * @returns {Promise<Array>} message objects (parents only; no thread replies)
   */
  async function getChannelHistory(channelId, { oldest, latest } = {}) {
    const messages = [];
    let cursor;
    try {
      do {
        const res = await client.conversations.history({
          channel: channelId,
          oldest,
          latest,
          limit: 200,
          cursor,
        });
        if (!res.ok) throw new Error(`Slack API error: ${res.error}`);
        for (const m of res.messages) {
          if (m.type === "message" && !m.subtype && m.text) messages.push(m);
        }
        cursor = res.response_metadata?.next_cursor || undefined;
      } while (cursor);
    } catch (error) {
      // scan.mjs prints this straight to the operator as "Skipping #x: ...",
      // so an untranslated code here is as unhelpful as it was on the award path.
      throw await explain(error, channelId);
    }
    return messages;
  }

  /** Get the canonical permalink URL for a message (used to award it later). */
  async function getPermalink(channelId, messageTs) {
    const r = await client.chat.getPermalink({
      channel: channelId,
      message_ts: messageTs,
    });
    if (!r.ok) throw new Error(`Slack API error: ${r.error}`);
    return r.permalink;
  }

  return {
    // parseSlackUrl is included so this object is a drop-in for the module
    // shape that buildDeps() and check-responses.mjs already consume.
    parseSlackUrl,
    whoAmI,
    getThreadReplies,
    getParentMessage,
    getUserNames,
    getUserDisplayName,
    getUserDisplayNames,
    listChannels,
    listChannelsDetailed,
    getChannelHistory,
    getPermalink,
  };
}
