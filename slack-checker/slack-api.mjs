import { WebClient } from "@slack/web-api";

const token = process.env.SLACK_BOT_TOKEN;

if (!token) {
  console.error("Error: SLACK_BOT_TOKEN environment variable is not set.");
  console.error("Please set it with: export SLACK_BOT_TOKEN='xoxb-your-token'");
  process.exit(1);
}

const client = new WebClient(token);

/**
 * Parse a Slack thread URL to extract channel ID and message timestamp
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
 * Get all replies to a thread
 * @param {string} channelId - Slack channel ID
 * @param {string} messageTs - Parent message timestamp
 * @returns {Promise<Array>} - Array of reply messages
 */
export async function getThreadReplies(channelId, messageTs) {
  try {
    const result = await client.conversations.replies({
      channel: channelId,
      ts: messageTs,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    // First message is the parent, rest are replies
    const replies = result.messages.slice(1);
    return replies;
  } catch (error) {
    if (error.data?.error === "channel_not_found") {
      throw new Error(
        `Channel not found. Make sure the bot is added to the channel.`
      );
    }
    if (error.data?.error === "thread_not_found") {
      throw new Error(`Thread not found. Check the URL is correct.`);
    }
    throw error;
  }
}

/**
 * Get the parent message of a thread
 * @param {string} channelId - Slack channel ID
 * @param {string} messageTs - Parent message timestamp
 * @returns {Promise<Object>} - Parent message object
 */
export async function getParentMessage(channelId, messageTs) {
  const result = await client.conversations.replies({
    channel: channelId,
    ts: messageTs,
    limit: 1,
  });

  if (!result.ok || !result.messages || result.messages.length === 0) {
    throw new Error("Could not fetch parent message");
  }

  return result.messages[0];
}

/**
 * Get a user's display name
 * @param {string} userId - Slack user ID
 * @returns {Promise<string>} - User's display name or real name
 */
export async function getUserDisplayName(userId) {
  try {
    const result = await client.users.info({
      user: userId,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    const user = result.user;
    // Prefer display_name, fall back to real_name
    return (
      user.profile.display_name || user.profile.real_name || user.name || userId
    );
  } catch (error) {
    console.error(`Warning: Could not fetch user info for ${userId}`);
    return userId;
  }
}

/**
 * Get display names for multiple users (with caching)
 * @param {string[]} userIds - Array of Slack user IDs
 * @returns {Promise<Map<string, string>>} - Map of userId to displayName
 */
export async function getUserDisplayNames(userIds) {
  const uniqueIds = [...new Set(userIds)];
  const nameMap = new Map();

  for (const userId of uniqueIds) {
    const displayName = await getUserDisplayName(userId);
    nameMap.set(userId, displayName);
  }

  return nameMap;
}
