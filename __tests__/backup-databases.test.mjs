import { selectBackupDatabases } from "../db/backup.mjs";

describe("selectBackupDatabases", () => {
  test("includes every lottery_* database that exists in MongoDB", () => {
    const existing = ["lottery_webdev_fall_2026", "lottery_db_fall_2021", "admin", "config"];
    expect(selectBackupDatabases(existing, [])).toEqual([
      "lottery_db_fall_2021",
      "lottery_webdev_fall_2026",
    ]);
  });

  test("ignores databases outside the lottery_ namespace", () => {
    expect(selectBackupDatabases(["admin", "local", "lotteryTests", "lottery"], [])).toEqual([]);
  });

  // The regression this whole function exists for: before it, the backup list
  // was derived from Object.keys(classes) alone, so commenting out a finished
  // semester silently dropped its database from every future backup.
  test("keeps a finished semester whose course key is gone from students.mjs", () => {
    const existing = ["lottery_webdev_summer_2026", "lottery_webdev_fall_2026"];
    const activeKeys = ["webdev_fall_2026"]; // summer has been commented out
    expect(selectBackupDatabases(existing, activeKeys)).toContain("lottery_webdev_summer_2026");
  });

  test("includes a newly added course that has no database yet", () => {
    expect(selectBackupDatabases([], ["webdev_fall_2026"])).toEqual(["lottery_webdev_fall_2026"]);
  });

  test("does not duplicate a course that is both configured and already present", () => {
    const existing = ["lottery_webdev_fall_2026"];
    expect(selectBackupDatabases(existing, ["webdev_fall_2026"])).toEqual([
      "lottery_webdev_fall_2026",
    ]);
  });
});
