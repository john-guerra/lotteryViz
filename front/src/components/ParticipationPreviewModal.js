import React from "react";
import PropTypes from "prop-types";

// Preview-before-write modal. Shows, per selected post, the matched/unmatched
// responders so the instructor can confirm before any grade is committed.
// Entry shape: { key, title, status: "loading"|"ready"|"error",
//                matched?, unmatched?, alreadyAwarded?, error? }

function snippet(text, max = 70) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

export default function ParticipationPreviewModal({
  open,
  title,
  entries,
  points,
  hours,
  committing,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const anyLoading = entries.some((e) => e.status === "loading");
  const ready = entries.filter((e) => e.status === "ready");
  const totalToAward = ready.reduce((sum, e) => sum + (e.matched?.length || 0), 0);
  const canConfirm = !anyLoading && !committing && totalToAward > 0;

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={committing ? undefined : onCancel}
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" onClick={onCancel} disabled={committing} />
          </div>

          <div className="modal-body">
            <p className="text-muted small mb-3">
              Awarding <strong>{points}</strong> point{points === 1 ? "" : "s"} per responder, counting replies within{" "}
              <strong>{hours}</strong> hour{hours === 1 ? "" : "s"} of each post. Nothing is written until you confirm.
            </p>

            {entries.map((e) => (
              <div key={e.key} className="border rounded p-2 mb-2">
                <div className="d-flex justify-content-between align-items-start">
                  <div className="me-2" title={e.title}>
                    {snippet(e.title)}
                  </div>
                  {e.alreadyAwarded && (
                    <span className="badge bg-warning text-dark text-nowrap">already graded → top-up</span>
                  )}
                </div>

                {e.status === "loading" && (
                  <div className="d-flex align-items-center gap-2 text-muted mt-1">
                    <div className="spinner-border spinner-border-sm" role="status" />
                    <span>Loading responders…</span>
                  </div>
                )}
                {e.status === "error" && <div className="text-danger mt-1 small">{e.error}</div>}
                {e.status === "ready" && (
                  <div className="mt-1 small">
                    <span className="text-success fw-bold">{e.matched.length} matched</span>
                    {" · "}
                    <span className={e.unmatched.length ? "text-danger" : "text-muted"}>
                      {e.unmatched.length} unmatched
                    </span>
                    {e.unmatched.length > 0 && (
                      <span className="text-muted"> ({e.unmatched.join(", ")})</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="modal-footer">
            <span className="me-auto text-muted small">
              {anyLoading ? "Resolving…" : `${totalToAward} grade${totalToAward === 1 ? "" : "s"} will be written`}
            </span>
            <button className="btn btn-secondary" onClick={onCancel} disabled={committing}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={onConfirm} disabled={!canConfirm}>
              {committing ? "Awarding…" : "Confirm award"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

ParticipationPreviewModal.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  entries: PropTypes.array.isRequired,
  points: PropTypes.number.isRequired,
  hours: PropTypes.number.isRequired,
  committing: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
