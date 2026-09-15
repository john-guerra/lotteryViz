import { checkCourse, formatReport, runDoctor } from "../doctor.mjs";

/** A fake slack-api object: one workspace, a fixed channel list. */
const fakeApi = ({ workspace = "sj.slack.com", team = "AI Coding SJ", channels = {} } = {}) => ({
  whoAmI: async () => ({ workspace, team, botName: "points_tracker" }),
  listChannelsDetailed: async () =>
    new Map(Object.entries(channels).map(([name, isMember]) => [name, { id: "C1", isMember }])),
});

describe("checkCourse()", () => {
  const config = {
    sj: { tokenEnv: "TOK_SJ", channels: ["#general", "#classchat", "#project"] },
  };

  test("reports ok when every configured channel exists and the bot is in it", async () => {
    const api = fakeApi({ channels: { "#general": true, "#classchat": true, "#project": true } });
    const report = await checkCourse("sj", config, () => api);
    expect(report.status).toBe("ok");
    expect(report.workspace).toBe("sj.slack.com");
    expect(report.channels.every((c) => c.status === "ok")).toBe(true);
  });

  test("distinguishes a channel the bot is not in from one that does not exist", async () => {
    // This is the distinction that cost real debugging time -- not_in_channel
    // and channel_not_found need different fixes (invite vs. wrong workspace).
    const api = fakeApi({ channels: { "#general": true, "#classchat": false } });
    const report = await checkCourse("sj", config, () => api);
    const byName = Object.fromEntries(report.channels.map((c) => [c.name, c.status]));
    expect(byName["#general"]).toBe("ok");
    expect(byName["#classchat"]).toBe("not-a-member");
    expect(byName["#project"]).toBe("not-found");
    expect(report.status).toBe("channel-issues");
  });

  test("a missing token is reported, not thrown", async () => {
    const resolver = () => {
      throw new Error("TOK_SJ is not set");
    };
    const report = await checkCourse("sj", config, resolver);
    expect(report.status).toBe("token-missing");
    expect(report.error).toMatch(/TOK_SJ/);
    expect(report.channels).toEqual([]);
  });

  test("an auth failure is reported against the course, not thrown", async () => {
    const api = {
      whoAmI: async () => {
        throw new Error("invalid_auth");
      },
      listChannelsDetailed: async () => new Map(),
    };
    const report = await checkCourse("sj", config, () => api);
    expect(report.status).toBe("auth-failed");
    expect(report.error).toMatch(/invalid_auth/);
  });
});

describe("runDoctor()", () => {
  test("one bad course does not stop the others being checked", async () => {
    const config = {
      good: { tokenEnv: "T_GOOD", channels: ["#general"] },
      bad: { tokenEnv: "T_BAD", channels: ["#general"] },
    };
    const resolver = (course) => {
      if (course === "bad") throw new Error("T_BAD is not set");
      return fakeApi({ channels: { "#general": true } });
    };
    const reports = await runDoctor({ config, resolver });
    expect(reports.map((r) => r.course)).toEqual(["good", "bad"]);
    expect(reports[0].status).toBe("ok");
    expect(reports[1].status).toBe("token-missing");
  });
});

describe("formatReport()", () => {
  test("shows the workspace each course resolved to", () => {
    const text = formatReport([
      {
        course: "sj",
        tokenEnv: "TOK_SJ",
        status: "ok",
        workspace: "sj.slack.com",
        team: "AI Coding SJ",
        channels: [{ name: "#general", status: "ok" }],
      },
    ]);
    expect(text).toContain("sj.slack.com");
    expect(text).toContain("TOK_SJ");
  });

  test("surfaces per-channel problems with actionable wording", () => {
    const text = formatReport([
      {
        course: "sj",
        tokenEnv: "TOK_SJ",
        status: "channel-issues",
        workspace: "sj.slack.com",
        channels: [
          { name: "#classchat", status: "not-a-member" },
          { name: "#project", status: "not-found" },
        ],
      },
    ]);
    expect(text).toMatch(/invite/i); // not-a-member -> invite the bot
    expect(text).toMatch(/not found|wrong workspace/i); // not-found -> wrong workspace
  });

  test("a token-missing course names the variable to set", () => {
    const text = formatReport([
      { course: "sj", tokenEnv: "TOK_SJ", status: "token-missing", error: "TOK_SJ is not set", channels: [] },
    ]);
    expect(text).toContain("TOK_SJ");
  });
});
