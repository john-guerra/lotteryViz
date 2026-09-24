// In-memory background-job store, extracted so the dedupe logic is testable.
// Same shape as the inline store in routes/participation.js:50-55.
export function createJobStore() {
  const jobs = new Map(); // jobId -> { status, key, log, result?, error? }
  const inFlightByKey = new Map(); // key -> jobId, only while running
  let nextJobId = 1;

  return {
    /**
     * Start `runner(log)` in the background under `key`. If a job for the same
     * key is still running, returns that job instead of starting a second one.
     * Lines passed to `log` are exposed on the job as they arrive, so a poller
     * can show progress before the result exists.
     */
    start(key, runner) {
      const existing = inFlightByKey.get(key);
      if (existing) return { jobId: existing, reused: true };

      const jobId = String(nextJobId++);
      const log = [];
      jobs.set(jobId, { status: "running", key, log });
      inFlightByKey.set(key, jobId);

      Promise.resolve()
        .then(() => runner((line) => log.push(line)))
        .then((result) => jobs.set(jobId, { status: "done", key, log, result }))
        .catch((error) =>
          jobs.set(jobId, { status: "error", key, log, error: error.message })
        )
        .finally(() => inFlightByKey.delete(key));

      return { jobId };
    },

    get(jobId) {
      return jobs.get(jobId);
    },
  };
}
