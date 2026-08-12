// Start-and-poll transport for Canvas export jobs. Both the export modal and
// the admin Grade column go through here, so a preview and the table can never
// disagree about what the server said.
//
// This deliberately does NOT reproduce the previous inline polling loop's error
// handling. That loop never checked res.ok, so a 404 ("job not found", which
// happens on every backend restart) parsed to a body with no `status`, matched
// no branch, and resolved as success with an undefined result.

const DEFAULT_POLL_MS = 1500;
const DEFAULT_DEADLINE_MS = 120000;

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function runExportJob({
  course,
  dryRun,
  pollMs = DEFAULT_POLL_MS,
  deadlineMs = DEFAULT_DEADLINE_MS,
  fetchImpl = fetch,
}) {
  let cancelled = false;
  let timer = null;

  const cancel = () => {
    cancelled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const promise = new Promise((resolve, reject) => {
    const sleep = (ms) =>
      new Promise((r) => {
        timer = setTimeout(r, ms);
      });

    (async () => {
      const startRes = await fetchImpl("/api/canvas/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course, dryRun }),
      });
      const startBody = await readJson(startRes);
      if (!startRes.ok) {
        throw new Error(startBody.error || `Export failed (${startRes.status})`);
      }
      const { jobId } = startBody;
      if (!jobId) throw new Error("Export did not return a job id.");

      const deadline = Date.now() + deadlineMs;

      for (;;) {
        if (cancelled) return undefined;
        await sleep(pollMs);
        if (cancelled) return undefined;

        const res = await fetchImpl(`/api/canvas/export/${jobId}`);
        const job = await readJson(res);
        if (!res.ok) {
          throw new Error(job.error || `Could not read job ${jobId} (${res.status})`);
        }

        if (job.status === "running") {
          if (Date.now() > deadline) {
            throw new Error(
              "Timed out waiting for the Canvas export to finish — it may " +
                "still be running on the server. Check back before retrying."
            );
          }
          continue;
        }
        if (job.status === "error") {
          throw new Error(job.error || "Canvas export failed.");
        }
        if (job.status !== "done") {
          throw new Error(`Canvas export returned an unexpected job status: ${job.status}`);
        }
        if (!job.result) {
          throw new Error("Canvas export finished with no result.");
        }
        if (job.result.success === false) {
          throw new Error(job.result.error || "Canvas export failed.");
        }
        return job.result;
      }
    })().then(
      (value) => {
        if (!cancelled) resolve(value);
      },
      (error) => {
        if (!cancelled) reject(error);
      }
    );
  });

  return { promise, cancel };
}
