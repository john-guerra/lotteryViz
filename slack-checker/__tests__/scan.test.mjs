import { toUnixSeconds, buildReferenceTexts } from "../scan.mjs";

describe("toUnixSeconds()", () => {
  test("converts a YYYY-MM-DD date to a unix-seconds string", () => {
    // 2026-05-04T00:00:00Z = 1777852800
    expect(toUnixSeconds("2026-05-04")).toBe("1777852800");
  });
  test("returns undefined for empty input", () => {
    expect(toUnixSeconds("")).toBeUndefined();
    expect(toUnixSeconds(undefined)).toBeUndefined();
  });
});

describe("buildReferenceTexts()", () => {
  test("combines ledger texts with seed phrases, de-duped, dropping empties", () => {
    const out = buildReferenceTexts(["offer A", "offer B", ""], ["seed 1", "offer A"]);
    expect(out.sort()).toEqual(["offer A", "offer B", "seed 1"].sort());
  });
  test("handles missing inputs", () => {
    expect(buildReferenceTexts(undefined, undefined)).toEqual([]);
  });
});
