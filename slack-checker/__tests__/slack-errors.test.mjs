import { describeSlackError } from "../slack-errors.mjs";

/** Shape of an error thrown by @slack/web-api: the code lives on `.data.error`. */
const slackError = (code, extra = {}) =>
  Object.assign(new Error(`An API error occurred: ${code}`), {
    data: { ok: false, error: code, ...extra },
  });

describe("describeSlackError()", () => {
  test("channel_not_found does NOT blame channel membership", () => {
    // The real-world trap: the bot being absent from a channel reports
    // `not_in_channel`, so telling the operator to invite the bot here sends
    // them down the wrong path entirely.
    const message = describeSlackError(slackError("channel_not_found")).message;
    expect(message).not.toMatch(/add(ed)? the bot|invite/i);
    expect(message).toMatch(/workspace/i);
  });

  test("channel_not_found names the token's workspace when one is known", () => {
    const message = describeSlackError(slackError("channel_not_found"), {
      workspace: "example-team.slack.com",
    }).message;
    expect(message).toContain("example-team.slack.com");
  });

  test("not_in_channel is the one that tells you to invite the bot", () => {
    const message = describeSlackError(slackError("not_in_channel"), {
      botName: "points_tracker",
    }).message;
    expect(message).toMatch(/invite/i);
    expect(message).toContain("points_tracker");
  });

  test("thread_not_found points at the URL, not at permissions", () => {
    const message = describeSlackError(slackError("thread_not_found")).message;
    expect(message).toMatch(/thread/i);
    expect(message).not.toMatch(/scope|workspace/i);
  });

  test("missing_scope surfaces the scope Slack asked for", () => {
    const message = describeSlackError(
      slackError("missing_scope", { needed: "groups:read", provided: "channels:read" })
    ).message;
    expect(message).toContain("groups:read");
  });

  test("the channel id is included so the operator can check it", () => {
    const message = describeSlackError(slackError("channel_not_found"), {
      channelId: "C0EXAMPLE123",
    }).message;
    expect(message).toContain("C0EXAMPLE123");
  });

  test("an unrecognized Slack code is passed through, not swallowed", () => {
    const original = slackError("ratelimited");
    expect(describeSlackError(original)).toBe(original);
  });

  test("a non-Slack error (no .data.error) is passed through untouched", () => {
    const original = new Error("socket hang up");
    expect(describeSlackError(original)).toBe(original);
  });

  test("returns an Error rather than throwing, so callers control the throw", () => {
    expect(describeSlackError(slackError("channel_not_found"))).toBeInstanceOf(Error);
  });
});
