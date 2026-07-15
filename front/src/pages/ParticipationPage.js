import React, { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import ParticipationPreviewModal from "../components/ParticipationPreviewModal";

// Slack participation-points page.
//   1. Posts & grading status — every ledger post and whether it is graded.
//   2. Scan for offer-posts — background semantic scan; select candidates and
//      award their responders (preview-before-write).
//   3. Award / add a post by URL — for posts the scanner missed.

const SCAN_POLL_MS = 2000;
const DEFAULT_POINTS = 2;
const DEFAULT_HOURS = 24;

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtUnixDate(ts) {
  const d = new Date(parseFloat(ts) * 1000);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function snippet(text, max = 90) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

// Hover card that reveals full, unwrapped text on demand. Replaces the native
// `title=` tooltip: styled, instant, and cursor-anchored so long Slack posts
// stay readable. Uses `position: fixed` + a portal-free floating div so the
// table's own overflow can't clip it. `pointerEvents: none` keeps the card from
// stealing the hover (which would flicker it) or blocking the wrapped link.
//
// Accessibility: the card also opens on keyboard focus (anchored to the focused
// element's box, since there's no cursor), and a resting `title` gives touch and
// assistive tech a fallback. `title` is dropped while the card is open so mouse
// users never see a duplicate native tooltip.
function TextTooltip({ text, children }) {
  const [pos, setPos] = useState(null);
  if (!text) return children;
  const track = (e) => setPos({ x: e.clientX, y: e.clientY });
  const trackFocus = (e) => {
    const r = e.target.getBoundingClientRect();
    setPos({ x: r.left, y: r.bottom });
  };
  // Flip the card above the anchor when there isn't room below it — a long post
  // hovered near the bottom of the table would otherwise fall off-screen (the
  // card is fixed + pointerEvents:none, so it can't be scrolled into view).
  const flipUp = pos && window.innerHeight - pos.y < 220;
  return (
    <span
      style={{ position: "relative" }}
      title={pos ? undefined : text}
      onMouseEnter={track}
      onMouseMove={track}
      onMouseLeave={() => setPos(null)}
      onFocus={trackFocus}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos && (
        <div
          role="tooltip"
          style={{
            position: "fixed",
            left: Math.min(pos.x + 14, window.innerWidth - 372),
            top: flipUp ? undefined : pos.y + 18,
            bottom: flipUp ? window.innerHeight - pos.y + 18 : undefined,
            zIndex: 1080,
            maxWidth: 360,
            maxHeight: "60vh",
            overflow: "hidden",
            whiteSpace: "pre-wrap",
            background: "#212529",
            color: "#fff",
            padding: "0.5rem 0.65rem",
            borderRadius: "0.375rem",
            boxShadow: "0 0.5rem 1rem rgba(0, 0, 0, 0.25)",
            fontSize: "0.8125rem",
            lineHeight: 1.35,
            pointerEvents: "none",
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

TextTooltip.propTypes = {
  text: PropTypes.string,
  children: PropTypes.node.isRequired,
};

export default function ParticipationPage() {
  const [courses, setCourses] = useState([]);
  const [course, setCourse] = useState("");

  const [posts, setPosts] = useState([]);
  const [postsError, setPostsError] = useState(null);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const [scanStatus, setScanStatus] = useState("idle"); // idle | running | done | error
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const pollRef = useRef(null);

  // Award controls
  const [points, setPoints] = useState(DEFAULT_POINTS);
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [selected, setSelected] = useState(() => new Set());
  const [awardUrl, setAwardUrl] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addAlsoAward, setAddAlsoAward] = useState(false);
  const [flash, setFlash] = useState(null); // { type, text }

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMode, setModalMode] = useState("award"); // award | addAndAward
  const [modalEntries, setModalEntries] = useState([]);
  const [committing, setCommitting] = useState(false);

  // --- data loading -------------------------------------------------------
  useEffect(() => {
    fetch("/api/participation/courses")
      .then((r) => r.json())
      .then((data) => {
        setCourses(data.courses || []);
        setCourse((prev) => prev || data.courses?.[0] || "");
      })
      .catch(() => setCourses([]));
  }, []);

  const refreshPosts = useCallback(() => {
    if (!course) return;
    setLoadingPosts(true);
    setPostsError(null);
    fetch(`/api/participation/posts?course=${encodeURIComponent(course)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setPosts(data.posts || []);
      })
      .catch((e) => setPostsError(e.message))
      .finally(() => setLoadingPosts(false));
  }, [course]);

  useEffect(() => {
    refreshPosts();
    setScanStatus("idle");
    setScanResult(null);
    setScanError(null);
    setSelected(new Set());
    setFlash(null);
    if (pollRef.current) clearInterval(pollRef.current);
  }, [course, refreshPosts]);

  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), []);

  // --- scan ---------------------------------------------------------------
  const pollJob = useCallback((jobId) => {
    pollRef.current = setInterval(() => {
      fetch(`/api/participation/scan/${jobId}`)
        .then((r) => r.json())
        .then((job) => {
          if (job.status === "done") {
            clearInterval(pollRef.current);
            setScanResult(job.result);
            setScanStatus("done");
          } else if (job.status === "error") {
            clearInterval(pollRef.current);
            setScanError(job.error || "Scan failed");
            setScanStatus("error");
          }
        })
        .catch((e) => {
          clearInterval(pollRef.current);
          setScanError(e.message);
          setScanStatus("error");
        });
    }, SCAN_POLL_MS);
  }, []);

  const startScan = useCallback(() => {
    if (!course) return;
    setScanStatus("running");
    setScanResult(null);
    setScanError(null);
    setSelected(new Set());
    fetch("/api/participation/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error || "Could not start scan");
        pollJob(body.jobId);
      })
      .catch((e) => {
        setScanError(e.message);
        setScanStatus("error");
      });
  }, [course, pollJob]);

  const candidates = scanResult?.candidates || [];

  // --- preview / award flow ----------------------------------------------
  const numPoints = Math.max(1, parseInt(points, 10) || DEFAULT_POINTS);
  const numHours = Math.max(0.1, parseFloat(hours) || DEFAULT_HOURS);

  // Open the modal for `items` ([{ key, title, threadUrl }]) and load a preview
  // for each. `mode` decides what Confirm does (award vs. add-and-award).
  const openPreview = useCallback(
    (title, mode, items) => {
      setModalTitle(title);
      setModalMode(mode);
      setModalEntries(items.map((it) => ({ ...it, status: "loading" })));
      setModalOpen(true);

      items.forEach((it) => {
        fetch("/api/participation/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ course, threadUrl: it.threadUrl, hours: numHours }),
        })
          .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
          .then(({ ok, body }) => {
            if (!ok) throw new Error(body.error || "Preview failed");
            setModalEntries((prev) =>
              prev.map((e) =>
                e.key === it.key
                  ? {
                      ...e,
                      status: "ready",
                      matched: body.matched,
                      unmatched: body.unmatched,
                      alreadyAwarded: body.alreadyAwarded,
                    }
                  : e
              )
            );
          })
          .catch((err) =>
            setModalEntries((prev) =>
              prev.map((e) => (e.key === it.key ? { ...e, status: "error", error: err.message } : e))
            )
          );
      });
    },
    [course, numHours]
  );

  const closeModal = useCallback(() => {
    if (committing) return;
    setModalOpen(false);
    setModalEntries([]);
  }, [committing]);

  const confirmModal = useCallback(async () => {
    const ready = modalEntries.filter((e) => e.status === "ready" && e.matched.length > 0);
    if (ready.length === 0) return;
    setCommitting(true);
    let totalAwarded = 0;
    const awardedKeys = [];
    try {
      for (const e of ready) {
        const endpoint = modalMode === "addAndAward" ? "/api/participation/add-by-url" : "/api/participation/award";
        const payload =
          modalMode === "addAndAward"
            ? { course, threadUrl: e.threadUrl, award: true, points: numPoints, hours: numHours }
            : { course, threadUrl: e.threadUrl, points: numPoints, hours: numHours, topUp: e.alreadyAwarded };
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Award failed");
        const awarded = modalMode === "addAndAward" ? body.award?.awarded || 0 : body.awarded || 0;
        totalAwarded += awarded;
        awardedKeys.push(e.key);
      }
      // Reflect awards in the candidate list without a re-scan.
      setScanResult((prev) =>
        prev
          ? {
              ...prev,
              candidates: prev.candidates.map((c) =>
                awardedKeys.includes(c.ts) ? { ...c, alreadyAwarded: true } : c
              ),
            }
          : prev
      );
      setSelected(new Set());
      setFlash({ type: "success", text: `Awarded ${totalAwarded} grade${totalAwarded === 1 ? "" : "s"}.` });
      setModalOpen(false);
      setModalEntries([]);
      refreshPosts();
    } catch (err) {
      setFlash({ type: "danger", text: err.message });
    } finally {
      setCommitting(false);
    }
  }, [modalEntries, modalMode, course, numPoints, numHours, refreshPosts]);

  // --- action triggers ----------------------------------------------------
  const toggleSelect = (ts) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(ts) ? next.delete(ts) : next.add(ts);
      return next;
    });
  };

  const awardSelected = () => {
    setFlash(null);
    const items = candidates
      .filter((c) => selected.has(c.ts))
      .map((c) => ({ key: c.ts, title: c.text, threadUrl: c.url }));
    const missing = items.filter((it) => !it.threadUrl);
    if (missing.length) {
      setFlash({ type: "danger", text: "Some selected posts have no resolvable Slack link; cannot award them." });
      return;
    }
    if (items.length === 0) return;
    openPreview(`Award ${items.length} selected post${items.length === 1 ? "" : "s"}`, "award", items);
  };

  const awardByUrl = () => {
    setFlash(null);
    if (!awardUrl.trim()) return;
    openPreview("Award by URL", "award", [{ key: "url", title: awardUrl.trim(), threadUrl: awardUrl.trim() }]);
  };

  const submitAddByUrl = async () => {
    setFlash(null);
    const url = addUrl.trim();
    if (!url) return;
    if (addAlsoAward) {
      // Preview first, then Confirm records + awards via /add-by-url.
      openPreview("Add post & award", "addAndAward", [{ key: "add", title: url, threadUrl: url }]);
      return;
    }
    try {
      const r = await fetch("/api/participation/add-by-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course, threadUrl: url }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Could not add post");
      setAddUrl("");
      setFlash({ type: "success", text: "Post recorded as a reference example." });
      refreshPosts();
    } catch (err) {
      setFlash({ type: "danger", text: err.message });
    }
  };

  const selectedCount = selected.size;

  return (
    <div className="container-fluid" style={{ paddingTop: "3rem", maxWidth: "1100px" }}>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h1 className="mb-0">Participation</h1>
        <label className="mb-0">
          Course:{" "}
          <select
            className="form-control d-inline-block w-auto"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
          >
            {courses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {flash && <div className={`alert alert-${flash.type} py-2`}>{flash.text}</div>}

      {/* Award settings (apply to every award action) */}
      <div className="d-flex align-items-end gap-3 mb-4 p-2 bg-light rounded">
        <label className="mb-0">
          <span className="small text-muted d-block">Points / responder</span>
          <input
            type="number"
            min="1"
            className="form-control form-control-sm"
            style={{ width: "110px" }}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
        </label>
        <label className="mb-0">
          <span className="small text-muted d-block">Window (hours)</span>
          <input
            type="number"
            min="0.1"
            step="0.5"
            className="form-control form-control-sm"
            style={{ width: "110px" }}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </label>
        <div className="small text-muted">
          Replies within the window are eligible; settings apply to all awards below.
        </div>
      </div>

      {/* === Posts & grading status === */}
      <section className="mb-5">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h4 className="mb-0">Posts &amp; grading status</h4>
          <button className="btn btn-sm btn-outline-secondary" onClick={refreshPosts} disabled={loadingPosts}>
            {loadingPosts ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {postsError && <div className="alert alert-danger py-2">{postsError}</div>}
        {!postsError && posts.length === 0 && !loadingPosts && (
          <p className="text-muted">No posts recorded for this course yet.</p>
        )}
        {posts.length > 0 && (
          <table className="table table-sm table-hover">
            <thead>
              <tr>
                <th>Posted</th>
                <th>Assigned</th>
                <th>Status</th>
                <th className="text-end">Points</th>
                <th className="text-end">Students</th>
                <th>Post</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.threadTs}>
                  <td className="text-nowrap">
                    {fmtDate(p.threadTs ? new Date(parseFloat(p.threadTs) * 1000) : null)}
                  </td>
                  <td className="text-nowrap">{p.awarded ? fmtDate(p.awardedAt) : "—"}</td>
                  <td>
                    {p.awarded ? (
                      <span className="badge bg-success">Graded</span>
                    ) : (
                      <span className="badge bg-secondary">Not graded</span>
                    )}
                  </td>
                  <td className="text-end">{p.awarded ? p.points ?? "" : ""}</td>
                  <td className="text-end">{p.awarded ? p.studentCount ?? "" : ""}</td>
                  <td>
                    <TextTooltip text={p.text}>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer">
                          {snippet(p.text)}
                        </a>
                      ) : (
                        <span>{snippet(p.text)}</span>
                      )}
                    </TextTooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* === Scan for offer-posts === */}
      <section className="mb-5">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h4 className="mb-0">Scan for offer-posts</h4>
          <div className="d-flex gap-2">
            {candidates.length > 0 && (
              <button className="btn btn-success btn-sm" onClick={awardSelected} disabled={selectedCount === 0}>
                Award selected ({selectedCount})
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={startScan} disabled={scanStatus === "running" || !course}>
              {scanStatus === "running" ? "Scanning…" : "Scan channels"}
            </button>
          </div>
        </div>
        <p className="text-muted small mb-2">
          Searches the configured channels for likely point-offer posts using the local classifier. The first run loads
          the embedding model and may take a while.
        </p>

        {scanStatus === "running" && (
          <div className="d-flex align-items-center gap-2 text-muted">
            <div className="spinner-border spinner-border-sm" role="status" />
            <span>Scanning Slack…</span>
          </div>
        )}
        {scanStatus === "error" && <div className="alert alert-danger py-2">{scanError}</div>}
        {scanStatus === "done" && scanResult?.noReferences && (
          <div className="alert alert-warning py-2">
            No reference examples yet, so the classifier has nothing to match against. Add a known offer-post below (or
            seed phrases in <code>slack-checker/config.json</code>), then scan again.
          </div>
        )}
        {scanStatus === "done" && !scanResult?.noReferences && (
          <>
            <p className="text-muted small">
              Scanned {scanResult.channelsScanned?.join(", ") || "(no channels)"}; embedded {scanResult.embeddedCount}{" "}
              messages.
            </p>
            {candidates.length === 0 ? (
              <p className="text-muted">No likely point-offer posts found.</p>
            ) : (
              <table className="table table-sm table-hover">
                <thead>
                  <tr>
                    <th style={{ width: "2rem" }} />
                    <th className="text-end">Match</th>
                    <th>Date</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th>Post</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.ts}>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={selected.has(c.ts)}
                          disabled={!c.url}
                          title={c.url ? "" : "No resolvable Slack link"}
                          onChange={() => toggleSelect(c.ts)}
                        />
                      </td>
                      <td className="text-end">{(c.score * 100).toFixed(0)}%</td>
                      <td className="text-nowrap">{fmtUnixDate(c.ts)}</td>
                      <td className="text-nowrap">{c.channel}</td>
                      <td>
                        {c.alreadyAwarded ? (
                          <span className="badge bg-success">Graded</span>
                        ) : c.inLedger ? (
                          <span className="badge bg-info text-dark">In ledger</span>
                        ) : (
                          <span className="badge bg-warning text-dark">New</span>
                        )}
                      </td>
                      <td title={c.text}>
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noreferrer">
                            {snippet(c.text)}
                          </a>
                        ) : (
                          snippet(c.text)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* === Award / add by URL === */}
      <section>
        <h4 className="mb-3">Award or add a post by URL</h4>
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label small text-muted mb-1">Award points from a thread URL</label>
            <div className="input-group input-group-sm">
              <input
                type="text"
                className="form-control"
                placeholder="https://…slack.com/archives/C…/p…"
                value={awardUrl}
                onChange={(e) => setAwardUrl(e.target.value)}
              />
              <button className="btn btn-success" onClick={awardByUrl} disabled={!awardUrl.trim()}>
                Preview &amp; award
              </button>
            </div>
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label small text-muted mb-1">Add a post to teach the scanner</label>
            <div className="input-group input-group-sm">
              <input
                type="text"
                className="form-control"
                placeholder="https://…slack.com/archives/C…/p…"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
              />
              <button className="btn btn-outline-primary" onClick={submitAddByUrl} disabled={!addUrl.trim()}>
                {addAlsoAward ? "Add & award" : "Add reference"}
              </button>
            </div>
            <label className="form-check-label small mt-1 d-flex align-items-center gap-1">
              <input
                type="checkbox"
                className="form-check-input"
                checked={addAlsoAward}
                onChange={(e) => setAddAlsoAward(e.target.checked)}
              />
              Also award points now
            </label>
          </div>
        </div>
      </section>

      <ParticipationPreviewModal
        open={modalOpen}
        title={modalTitle}
        entries={modalEntries}
        points={numPoints}
        hours={numHours}
        committing={committing}
        onConfirm={confirmModal}
        onCancel={closeModal}
      />
    </div>
  );
}
