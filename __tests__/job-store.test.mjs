import { createJobStore } from "../routes/job-store.mjs";

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("createJobStore", () => {
  test("records a completed job result", async () => {
    const store = createJobStore();
    const { jobId } = store.start("webdev_summer_2026", async () => ({ submitted: 3 }));
    expect(store.get(jobId).status).toBe("running");
    await flush();
    expect(store.get(jobId)).toMatchObject({ status: "done", result: { submitted: 3 } });
  });

  test("records a failed job as error", async () => {
    const store = createJobStore();
    const { jobId } = store.start("k", async () => {
      throw new Error("canvas exploded");
    });
    await flush();
    expect(store.get(jobId)).toMatchObject({ status: "error", error: "canvas exploded" });
  });

  test("dedupes a second job for the same key while in flight", () => {
    const store = createJobStore();
    const first = store.start("k", () => new Promise(() => {}));
    const second = store.start("k", () => new Promise(() => {}));
    expect(second.jobId).toBe(first.jobId);
    expect(second.reused).toBe(true);
  });

  test("allows a new job for the same key once the first settles", async () => {
    const store = createJobStore();
    const first = store.start("k", async () => "done");
    await flush();
    const second = store.start("k", async () => "again");
    expect(second.jobId).not.toBe(first.jobId);
    expect(second.reused).toBeUndefined();
  });

  test("keys are independent", () => {
    const store = createJobStore();
    const a = store.start("a", () => new Promise(() => {}));
    const b = store.start("b", () => new Promise(() => {}));
    expect(b.jobId).not.toBe(a.jobId);
  });

  test("returns undefined for an unknown job", () => {
    expect(createJobStore().get("999")).toBeUndefined();
  });
});
