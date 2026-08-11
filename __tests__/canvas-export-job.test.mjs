import { runExportJob } from "../front/src/canvasExportJob.mjs";

// Builds a fake fetch that returns queued responses in order. The last
// response repeats forever, so a polling loop can keep calling it.
function fakeFetch(responses) {
  const queue = [...responses];
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return {
      ok: next.ok !== false,
      status: next.status ?? 200,
      json: async () => next.body,
    };
  };
  impl.calls = calls;
  return impl;
}

const FAST = { pollMs: 1, deadlineMs: 500 };

describe("runExportJob", () => {
  test("resolves with the job result once the job is done", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "7" } },
      { body: { status: "running" } },
      { body: { status: "done", result: { success: true, studentsWithGrades: [] } } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).resolves.toMatchObject({ success: true });
  });

  test("sends course and dryRun in the POST body", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "done", result: { success: true } } },
    ]);
    const { promise } = runExportJob({ course: "abc", dryRun: true, fetchImpl, ...FAST });
    await promise;
    expect(JSON.parse(fetchImpl.calls[0].options.body)).toEqual({
      course: "abc",
      dryRun: true,
    });
  });

  test("rejects when the poll returns 404 instead of resolving as success", async () => {
    // Regression: the old inline loop never checked res.ok, so a 404 body with
    // no `status` fell through every branch and resolved with result undefined.
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { ok: false, status: 404, body: { error: "job not found" } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow(/job not found/);
  });

  test("rejects when the POST itself fails", async () => {
    const fetchImpl = fakeFetch([
      { ok: false, status: 400, body: { error: "c is not wired for Canvas export." } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow(/not wired for Canvas export/);
  });

  test("surfaces a job-level error", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "error", error: "canvas exploded" } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow("canvas exploded");
  });

  test("surfaces a result-level failure", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "done", result: { success: false, error: "Course not found" } } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow("Course not found");
  });

  test("rejects on an unrecognized job status", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "banana" } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow(/unexpected job status/i);
  });

  test("rejects when a done job carries no result", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "done" } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow(/no result/i);
  });

  test("rejects once the deadline passes", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "running" } },
    ]);
    const { promise } = runExportJob({
      course: "c",
      dryRun: true,
      fetchImpl,
      pollMs: 1,
      deadlineMs: 30,
    });
    await expect(promise).rejects.toThrow(/timed out/i);
  });

  test("stops polling after cancel", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "running" } },
    ]);
    const { cancel } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await new Promise((r) => setTimeout(r, 20));
    cancel();
    const after = fetchImpl.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchImpl.calls.length).toBe(after);
  });
});
