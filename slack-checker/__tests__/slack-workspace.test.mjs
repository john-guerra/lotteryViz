import {
  resolveTokenEnv,
  resolveToken,
  createCourseApiResolver,
  DEFAULT_TOKEN_ENV,
} from "../slack-workspace.mjs";

const config = {
  aicoding_sj_fall_2026: { tokenEnv: "SLACK_BOT_TOKEN_aicoding_sj_fall_2026" },
  aicoding_hybrid_fall_2026: { tokenEnv: "SLACK_BOT_TOKEN_aicoding_hybrid_fall_2026" },
  webdev_summer_2026: {}, // legacy entry, no tokenEnv
};

describe("resolveTokenEnv()", () => {
  test("uses the course's explicit tokenEnv", () => {
    expect(resolveTokenEnv("aicoding_sj_fall_2026", config)).toBe(
      "SLACK_BOT_TOKEN_aicoding_sj_fall_2026"
    );
  });

  test("falls back to the global var when the course omits tokenEnv", () => {
    expect(resolveTokenEnv("webdev_summer_2026", config)).toBe(DEFAULT_TOKEN_ENV);
  });

  test("throws naming the course when it has no config entry at all", () => {
    expect(() => resolveTokenEnv("nope_fall_2026", config)).toThrow(/nope_fall_2026/);
  });
});

describe("resolveToken()", () => {
  const env = { SLACK_BOT_TOKEN_aicoding_sj_fall_2026: "xoxb-sj" };

  test("returns the token and the var it came from", () => {
    expect(resolveToken("aicoding_sj_fall_2026", config, env)).toEqual({
      tokenEnv: "SLACK_BOT_TOKEN_aicoding_sj_fall_2026",
      token: "xoxb-sj",
    });
  });

  test("error names BOTH the course and the missing variable", () => {
    // The whole point: an operator reading this should not have to guess
    // which of three tokens is the broken one.
    let message = "";
    try {
      resolveToken("aicoding_hybrid_fall_2026", config, env);
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain("aicoding_hybrid_fall_2026");
    expect(message).toContain("SLACK_BOT_TOKEN_aicoding_hybrid_fall_2026");
    expect(message).toMatch(/\.env/);
  });

  test("treats an empty-string token as missing, not as a valid token", () => {
    expect(() =>
      resolveToken("aicoding_sj_fall_2026", config, {
        SLACK_BOT_TOKEN_aicoding_sj_fall_2026: "   ",
      })
    ).toThrow(/not set/i);
  });
});

describe("createCourseApiResolver()", () => {
  const env = {
    SLACK_BOT_TOKEN_aicoding_sj_fall_2026: "xoxb-sj",
    SLACK_BOT_TOKEN_aicoding_hybrid_fall_2026: "xoxb-hybrid",
  };

  test("builds one client per course, using that course's token", () => {
    const seen = [];
    const factory = (token) => {
      seen.push(token);
      return { token };
    };
    const forCourse = createCourseApiResolver({ config, env, factory });
    expect(forCourse("aicoding_sj_fall_2026").token).toBe("xoxb-sj");
    expect(forCourse("aicoding_hybrid_fall_2026").token).toBe("xoxb-hybrid");
    expect(seen).toEqual(["xoxb-sj", "xoxb-hybrid"]);
  });

  test("memoizes by token, so repeat calls reuse one client", () => {
    let built = 0;
    const factory = () => ({ id: ++built });
    const forCourse = createCourseApiResolver({ config, env, factory });
    const a = forCourse("aicoding_sj_fall_2026");
    const b = forCourse("aicoding_sj_fall_2026");
    expect(a).toBe(b);
    expect(built).toBe(1);
  });

  test("two courses sharing one token share one client", () => {
    // Not today's layout, but the memo key is the token precisely so that
    // moving courses onto a shared workspace doesn't multiply connections.
    const shared = { a_course: { tokenEnv: "T" }, b_course: { tokenEnv: "T" } };
    let built = 0;
    const factory = () => ({ id: ++built });
    const forCourse = createCourseApiResolver({
      config: shared,
      env: { T: "xoxb-same" },
      factory,
    });
    expect(forCourse("a_course")).toBe(forCourse("b_course"));
    expect(built).toBe(1);
  });

  test("a missing token surfaces per course and does not poison other courses", () => {
    const factory = (token) => ({ token });
    const forCourse = createCourseApiResolver({
      config,
      env: { SLACK_BOT_TOKEN_aicoding_sj_fall_2026: "xoxb-sj" },
      factory,
    });
    expect(() => forCourse("aicoding_hybrid_fall_2026")).toThrow(/aicoding_hybrid_fall_2026/);
    // The healthy course still works afterwards.
    expect(forCourse("aicoding_sj_fall_2026").token).toBe("xoxb-sj");
  });
});
