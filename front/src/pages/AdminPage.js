import React, { useEffect, useState, useCallback, useRef } from "react";
import { SelectionProvider } from "../context/SelectionContext";
import { useCourse } from "../context/CourseContext";
import StudentTable from "../components/StudentTable";
import AdminLotteryChart from "../components/AdminLotteryChart";
import StudentHistoryModal from "../components/StudentHistoryModal";
import CanvasExportModal from "../components/CanvasExportModal";
import { classes } from "../students.mjs";
import { getCanvasConfig } from "../courses.mjs";
import { runExportJob } from "../canvasExportJob.mjs";

// Stable identity so the prop does not change on every render and defeat
// StudentTable's useMemo dependencies.
const EMPTY_SET = new Set();

function AdminPage() {
  const { course, setCourse, courses } = useCourse();
  const [counts, setCounts] = useState([]);
  const [allGrades, setAllGrades] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyStudent, setHistoryStudent] = useState(null);
  const [studentIdMap, setStudentIdMap] = useState({});
  const [searchName, setSearchName] = useState("");
  const [anonymize, setAnonymize] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [canvasGrades, setCanvasGrades] = useState(null); // { byName, unmatched, loadedAt }
  const [gradesStatus, setGradesStatus] = useState("idle"); // idle|loading|ready|error
  const [gradesError, setGradesError] = useState(null);
  const gradeJobRef = useRef(null);

  const refreshData = useCallback(() => {
    const counts = fetch("getCounts/" + course)
      .then((res) => res.json())
      .then((_counts) => setCounts(_counts));

    const grades = fetch("getAllGrades/" + course)
      .then((res) => res.json())
      .then((_grades) => setAllGrades(_grades));

    return Promise.all([counts, grades]);
  }, [course]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Grades belong to the course they were computed for. Cancel any in-flight
  // job too, so a slow response for the previous course cannot land on the new
  // one and quietly mislabel every row.
  useEffect(() => {
    setCanvasGrades(null);
    setGradesStatus("idle");
    setGradesError(null);
    return () => {
      if (gradeJobRef.current) {
        gradeJobRef.current.cancel();
        gradeJobRef.current = null;
      }
    };
  }, [course]);

  const onChangeCourse = (evt) => {
    setCourse(evt.target.value);
  };

  const handleShowHistory = (studentName) => {
    setHistoryStudent(studentName);
    setShowHistoryModal(true);
  };

  const handleCloseHistory = () => {
    setShowHistoryModal(false);
    setHistoryStudent(null);
  };

  const handleStudentIdMapReady = useCallback((idMap) => {
    setStudentIdMap(idMap);
  }, []);

  const handleLoadGrades = useCallback(async () => {
    setGradesStatus("loading");
    setGradesError(null);

    // Refresh the table first. refreshData reads Mongo at page load; the dry
    // run re-reads it server-side at click time. Without this, Grade would be
    // computed from a newer dataset than every other column — a row could read
    // "Points: 12" beside a grade computed from 14.
    try {
      await refreshData();
    } catch {
      // A failed refresh is not fatal — the grades are still worth loading,
      // and the stale-Points risk is what the caption's timestamp is for.
    }

    const job = runExportJob({ course, dryRun: true });
    gradeJobRef.current = job;

    try {
      const result = await job.promise;
      // Bail out if a newer invocation (or a course-change cancel) has
      // already replaced/cleared the ref — this job is stale and must not
      // touch state or null out someone else's ref.
      if (gradeJobRef.current !== job) return;
      gradeJobRef.current = null;
      setCanvasGrades({
        byName: Object.fromEntries(
          (result.studentsWithGrades || [])
            .filter((s) => s.lotteryName)
            .map((s) => [s.lotteryName, s.grade])
        ),
        unmatched: new Set((result.unmatchedLottery || []).map((u) => u.name)),
        loadedAt: new Date(),
      });
      setGradesStatus("ready");
    } catch (err) {
      if (gradeJobRef.current !== job) return;
      gradeJobRef.current = null;
      setGradesError(err.message);
      setGradesStatus("error");
    }
  }, [course, refreshData]);

  // Presence of a canvas block is what makes a course exportable. A null
  // assignment id is NOT disqualifying — the live run finds or creates it.
  const canvasConfig = getCanvasConfig(course);
  const assignmentId = canvasConfig?.lotteryAssignmentId;
  const exportTitle = canvasConfig
    ? "Preview and export lottery grades to Canvas"
    : `${course} is not wired for Canvas export`;

  return (
    <SelectionProvider>
      <div className="container-fluid d-flex flex-column" style={{ height: "100vh", overflow: "hidden" }}>
        <div className="d-flex align-items-center justify-content-between mb-2 py-2" style={{ flexShrink: 0 }}>
          <h1 className="mb-0">Admin Dashboard</h1>
          <label className="mb-0">
            Course:{" "}
            <select
              className="form-control d-inline-block w-auto"
              name="course"
              value={course}
              onChange={onChangeCourse}
            >
              {courses.map((c) => (
                <option value={c.key} key={c.key}>
                  {c.key}
                </option>
              ))}
            </select>
          </label>
          <div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={handleLoadGrades}
              disabled={!canvasConfig || gradesStatus === "loading"}
              title={
                canvasConfig
                  ? "Fetch the grades Canvas would receive"
                  : `${course} is not wired for Canvas export`
              }
            >
              {gradesStatus === "loading" ? "Loading grades…" : "Load Canvas grades"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setExportOpen(true)}
              disabled={!canvasConfig}
              title={exportTitle}
            >
              Export to Canvas
            </button>
          </div>
        </div>

        <div className="row flex-grow-1" style={{ minHeight: 0 }}>
          <div className="col-md-5 d-flex flex-column" style={{ minHeight: 0, maxHeight: "100%", overflow: "hidden" }}>
            <div className="d-flex align-items-center justify-content-between mb-2" style={{ flexShrink: 0 }}>
              <h4 className="mb-0">Students</h4>
              <div className="d-flex align-items-center gap-2">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  style={{ width: "150px" }}
                  placeholder="Search..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                />
                <label className="form-check-label d-flex align-items-center gap-1" style={{ fontSize: "0.875rem" }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={anonymize}
                    onChange={(e) => setAnonymize(e.target.checked)}
                  />
                  Anonymize
                </label>
              </div>
            </div>
            <StudentTable
              counts={counts}
              allGrades={allGrades}
              onShowHistory={handleShowHistory}
              studentIdMap={studentIdMap}
              anonymize={anonymize}
              searchFilter={searchName}
              canvasGrades={canvasGrades?.byName ?? null}
              unmatchedNames={canvasGrades?.unmatched ?? EMPTY_SET}
              gradesStatus={gradesStatus}
            />
            {gradesStatus === "ready" && (
              <small className="text-muted mt-1">
                Canvas grades loaded{" "}
                {canvasGrades.loadedAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 align-baseline"
                  onClick={handleLoadGrades}
                >
                  Reload
                </button>
              </small>
            )}
            {gradesStatus === "error" && (
              <small className="text-danger mt-1">
                {gradesError}{" "}
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 align-baseline"
                  onClick={handleLoadGrades}
                >
                  Retry
                </button>
              </small>
            )}
          </div>
          <div className="col-md-7 d-flex flex-column" style={{ minHeight: 0 }}>
            <div className="d-flex align-items-center justify-content-between mb-2" style={{ flexShrink: 0 }}>
              <h4 className="mb-0">Points Over Time</h4>
            </div>
            <AdminLotteryChart
              grades={allGrades}
              roster={classes[course].roster}
              medianAdjustment={classes[course].medianAdjustment ?? 0}
              onStudentIdMapReady={handleStudentIdMapReady}
              studentName={searchName}
            />
          </div>
        </div>

        <StudentHistoryModal
          show={showHistoryModal}
          onClose={handleCloseHistory}
          studentName={historyStudent}
          allGrades={allGrades}
        />

        <CanvasExportModal
          open={exportOpen}
          course={course}
          assignmentId={assignmentId}
          onClose={() => setExportOpen(false)}
        />
      </div>
    </SelectionProvider>
  );
}

export default AdminPage;
