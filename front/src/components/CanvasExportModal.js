import React, { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

// Preview-before-write modal for Canvas grade export. Opens on a dry run,
// renders the computed grades, and only writes when the instructor confirms.
// The confirm re-runs the export live rather than replaying the preview, so a
// stale preview can never submit old grades.

const POLL_MS = 1500;

async function startExport({ course, dryRun }) {
  const res = await fetch("/api/canvas/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course, dryRun }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Export failed (${res.status})`);
  return data.jobId;
}

export default function CanvasExportModal({
  open,
  course,
  assignmentId,
  onClose,
}) {
  const [phase, setPhase] = useState("running"); // running|preview|committing|done|error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const run = useCallback(
    async (dryRun) => {
      setPhase(dryRun ? "running" : "committing");
      setError(null);
      try {
        const jobId = await startExport({ course, dryRun });
        pollRef.current = setInterval(async () => {
          const res = await fetch(`/api/canvas/export/${jobId}`);
          const job = await res.json();
          if (job.status === "running") return;
          stopPolling();
          if (job.status === "error") {
            setError(job.error);
            setPhase("error");
          } else if (job.result?.success === false) {
            setError(job.result.error || "Export failed.");
            setPhase("error");
          } else {
            setResult(job.result);
            setPhase(dryRun ? "preview" : "done");
          }
        }, POLL_MS);
      } catch (err) {
        setError(err.message);
        setPhase("error");
      }
    },
    [course, stopPolling]
  );

  useEffect(() => {
    if (!open) return undefined;
    setResult(null);
    run(true);
    return stopPolling;
  }, [open, run, stopPolling]);

  if (!open) return null;

  const busy = phase === "running" || phase === "committing";
  const students = result?.studentsWithGrades || [];
  const unmatched = result?.unmatchedLottery || [];

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={busy ? undefined : onClose}
    >
      <div
        className="modal-dialog modal-lg modal-dialog-scrollable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              Export to Canvas — {course}
            </h5>
            {!busy && (
              <button type="button" className="close" onClick={onClose}>
                <span>&times;</span>
              </button>
            )}
          </div>

          <div className="modal-body">
            {phase === "running" && <p>Computing grades…</p>}
            {phase === "committing" && <p>Submitting to Canvas…</p>}
            {phase === "error" && <div className="alert alert-danger mb-0">{error}</div>}

            {phase === "done" && (
              <div className="alert alert-success mb-0">
                Submitted {result.submitted}, {result.errors} error
                {result.errors === 1 ? "" : "s"}
                {result.verification
                  ? `, verified ${result.verification.verified}/${result.verification.total}`
                  : ""}
                .
              </div>
            )}

            {phase === "preview" && (
              <>
                <p className="mb-2">
                  <strong>{students.length}</strong> grades ready. Median{" "}
                  {result.stats?.median} pts, {result.stats?.medianCalls} calls.
                </p>

                {/* Unmatched leads: name matching runs at 70% confidence, and an
                    unmatched student is about to silently receive no grade. */}
                {unmatched.length > 0 && (
                  <div className="alert alert-warning">
                    <strong>{unmatched.length} unmatched</strong> — these students have
                    lottery points but no Canvas match, and will not be graded:
                    <ul className="mb-0 mt-1">
                      {unmatched.map((u) => (
                        <li key={u.name}>
                          {u.name} ({u.calls} call{u.calls === 1 ? "" : "s"}, {u.points} pts)
                          {u.bestMatch && (
                            <span className="text-muted">
                              {" "}
                              — closest: {u.bestMatch} ({u.bestScore}%)
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!assignmentId && (
                  <div className="alert alert-info">
                    No lottery assignment is configured for this course. Submitting
                    will find or create one in Canvas.
                  </div>
                )}

                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Lottery name</th>
                      <th>Canvas name</th>
                      <th className="text-right">Grade</th>
                      <th className="text-right">Pts</th>
                      <th className="text-right">Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.canvasUserId}>
                        <td>{s.lotteryName}</td>
                        <td>{s.canvasName}</td>
                        <td className="text-right">{s.grade}</td>
                        <td className="text-right">{s.points}</td>
                        <td className="text-right">{s.calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              {phase === "done" || phase === "error" ? "Close" : "Cancel"}
            </button>
            {phase === "preview" && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => run(false)}
                disabled={students.length === 0}
              >
                Submit {students.length} grades to Canvas
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

CanvasExportModal.propTypes = {
  open: PropTypes.bool.isRequired,
  course: PropTypes.string.isRequired,
  assignmentId: PropTypes.number,
  onClose: PropTypes.func.isRequired,
};
