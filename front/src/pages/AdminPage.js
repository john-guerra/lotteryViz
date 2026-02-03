import React, { useEffect, useState, useCallback } from "react";
import { SelectionProvider } from "../context/SelectionContext";
import StudentTable from "../components/StudentTable";
import AdminLotteryChart from "../components/AdminLotteryChart";
import StudentHistoryModal from "../components/StudentHistoryModal";
import { classes } from "../students.mjs";

function AdminPage() {
  const [course, setCourse] = useState(Object.keys(classes)[0]);
  const [counts, setCounts] = useState([]);
  const [allGrades, setAllGrades] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyStudent, setHistoryStudent] = useState(null);
  const [studentIdMap, setStudentIdMap] = useState({});
  const [searchName, setSearchName] = useState("");
  const [anonymize, setAnonymize] = useState(true);

  const refreshData = useCallback(() => {
    fetch("getCounts/" + course)
      .then((res) => res.json())
      .then((_counts) => setCounts(_counts));

    fetch("getAllGrades/" + course)
      .then((res) => res.json())
      .then((grades) => setAllGrades(grades));
  }, [course]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

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
              {Object.keys(classes).map((c) => (
                <option value={c} key={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row flex-grow-1" style={{ minHeight: 0 }}>
          <div className="col-md-5 d-flex flex-column" style={{ minHeight: 0, overflow: "hidden" }}>
            <div className="d-flex align-items-center justify-content-between mb-2" style={{ flexShrink: 0 }}>
              <h4 className="mb-0">Students</h4>
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
            <StudentTable
              counts={counts}
              allGrades={allGrades}
              onShowHistory={handleShowHistory}
              studentIdMap={studentIdMap}
              anonymize={anonymize}
            />
          </div>
          <div className="col-md-7 d-flex flex-column" style={{ minHeight: 0 }}>
            <div className="d-flex align-items-center justify-content-between mb-2" style={{ flexShrink: 0 }}>
              <h4 className="mb-0">Points Over Time</h4>
              <div className="d-flex align-items-center gap-2">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  style={{ width: "180px" }}
                  placeholder="Search by name..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                />
              </div>
            </div>
            <AdminLotteryChart
              grades={allGrades}
              roster={classes[course]}
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
      </div>
    </SelectionProvider>
  );
}

export default AdminPage;
