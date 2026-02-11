import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import useLotteryEngine from "./useLotteryEngine";
import visualizations from "./visualizations";
import "./LotteryShell.css";

/**
 * Shorten a name to fit within maxChars by collapsing trailing words to initials.
 * e.g. "John Alexis Guerra Gomez" with maxChars=12 → "John A.G.G."
 */
function shortenName(name, maxChars) {
  if (!maxChars || name.length <= maxChars) return name;
  const words = name.split(" ");
  if (words.length <= 1) return name;

  // Try keeping progressively fewer full words, collapsing the rest to initials
  for (let keep = words.length - 1; keep >= 1; keep--) {
    const head = words.slice(0, keep).join(" ");
    const tail = words
      .slice(keep)
      .map((w) => w[0].toUpperCase() + ".")
      .join("");
    const result = head + " " + tail;
    if (result.length <= maxChars) return result;
  }

  // Even one full word + initials doesn't fit — just use first word + initials
  const head = words[0];
  const tail = words
    .slice(1)
    .map((w) => w[0].toUpperCase() + ".")
    .join("");
  return head + " " + tail;
}

const vizKeys = Object.keys(visualizations);

const LotteryShell = (props) => {
  const [vizType, setVizType] = useState("bubbles");
  const [radiusScale, setRadiusScale] = useState(1.0);
  // Word cloud parameters
  const [cloudPadding, setCloudPadding] = useState(4);
  const [cloudRotateChance, setCloudRotateChance] = useState(0);
  const [cloudFontSize, setCloudFontSize] = useState(1.0);
  // Name shortening: 0 means no limit
  const [maxNameChars, setMaxNameChars] = useState(0);
  const containerRef = useRef();
  const vizContainerRef = useRef();
  const [dims, setDims] = useState({ width: 600, height: 600 });

  const engine = useLotteryEngine({
    options: props.options,
    counts: props.counts,
    optionsDrawn: props.optionsDrawn,
    setOptionSel: props.setOptionSel,
  });

  // Measure available space for the visualization
  useEffect(() => {
    function measure() {
      const el = vizContainerRef.current;
      if (!el) return;
      const w = el.clientWidth || 600;
      // Use viewport height minus the element's top offset, with some padding
      const top = el.getBoundingClientRect().top;
      const h = Math.max(400, window.innerHeight - top - 16);
      setDims({ width: w, height: h });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const { width, height } = dims;

  // Apply name shortening when maxNameChars is set
  const displayStudents = useMemo(() => {
    return engine.students.map((s) => ({
      ...s,
      originalName: s.name,
      name: maxNameChars ? shortenName(s.name, maxNameChars) : s.name,
    }));
  }, [engine.students, maxNameChars]);

  const displayStudentsLeft = useMemo(() => {
    if (!maxNameChars) return engine.studentsLeft;
    return engine.studentsLeft.map((s) => ({
      ...s,
      name: shortenName(s.name, maxNameChars),
    }));
  }, [engine.studentsLeft, maxNameChars]);

  // Also shorten the selectedStudent name so comparisons match in visualizations
  const displaySelectedStudent = useMemo(() => {
    if (!maxNameChars || !props.optionSel) return props.optionSel;
    return { ...props.optionSel, name: shortenName(props.optionSel.name, maxNameChars) };
  }, [props.optionSel, maxNameChars]);

  // Click a bubble to draw that student
  const handleBubbleClick = useCallback((student) => {
    if (student.drawn) return;
    engine.onChooseByName(student.originalName || student.name);
  }, [engine]);

  const VizComponent = visualizations[vizType].component;

  return (
    <div className="LotteryShell" ref={containerRef}>
      <div className="mb-2 d-flex align-items-center gap-2">
        <button
          className="btn btn-outline-primary"
          id="btnChoose"
          onClick={engine.onChoose}
        >
          Do you feel lucky?
        </button>
        <small>Options left: {engine.optionsLeft.length}</small>

        <div className="btn-group btn-group-sm ms-auto">
          {vizKeys.map((key) => (
            <button
              key={key}
              className={
                "btn btn-outline-secondary" + (vizType === key ? " active" : "")
              }
              onClick={() => setVizType(key)}
            >
              {visualizations[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-check">
        <label className="form-check-label">
          Adjust chances by history
          <input
            className="form-check-input mx-1"
            onChange={engine.onAdjustByHistory}
            checked={engine.adjust}
            type="checkbox"
          />
        </label>
      </div>
      <div className="form-check">
        <label className="form-check-label">
          Avoid repetition
          <input
            className="form-check-input mx-1"
            onChange={engine.onAvoidRepetition}
            checked={engine.avoidRepetition}
            type="checkbox"
          />
        </label>
      </div>
      <div className="form-check">
        Adjust by:
        <label className="form-check-label mx-1">
          # Calls
          <input
            className="form-check-input mx-1"
            onChange={engine.onAdjustByVariable}
            checked={engine.adjustByVariable === "count"}
            type="radio"
            name="adjustBy"
            value="count"
          />
        </label>
        <label className="form-check-label mx-1">
          Sum Points
          <input
            className="form-check-input mx-1"
            onChange={engine.onAdjustByVariable}
            checked={engine.adjustByVariable === "sum"}
            type="radio"
            name="adjustBy"
            value="sum"
          />
        </label>
      </div>

      {vizType === "bubbles" && (
        <div className="d-flex align-items-center gap-2 mb-1">
          <small className="text-muted">Size</small>
          <input
            type="range"
            className="form-range form-range-sm flex-grow-1"
            min="0.4"
            max="2"
            step="0.1"
            value={radiusScale}
            onChange={(e) => setRadiusScale(parseFloat(e.target.value))}
            style={{ maxWidth: 120 }}
          />
        </div>
      )}

      {vizType === "cloud" && (
        <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
          <small className="text-muted">Padding</small>
          <input
            type="range"
            className="form-range form-range-sm"
            min="0"
            max="20"
            step="1"
            value={cloudPadding}
            onChange={(e) => setCloudPadding(parseInt(e.target.value, 10))}
            style={{ maxWidth: 90 }}
          />
          <span className="text-muted" style={{ fontSize: "0.75rem" }}>{cloudPadding}</span>

          <small className="text-muted ms-2">Rotation %</small>
          <input
            type="range"
            className="form-range form-range-sm"
            min="0"
            max="1"
            step="0.05"
            value={cloudRotateChance}
            onChange={(e) => setCloudRotateChance(parseFloat(e.target.value))}
            style={{ maxWidth: 90 }}
          />
          <span className="text-muted" style={{ fontSize: "0.75rem" }}>{Math.round(cloudRotateChance * 100)}%</span>

          <small className="text-muted ms-2">Font size</small>
          <input
            type="range"
            className="form-range form-range-sm"
            min="0.3"
            max="3"
            step="0.1"
            value={cloudFontSize}
            onChange={(e) => setCloudFontSize(parseFloat(e.target.value))}
            style={{ maxWidth: 90 }}
          />
          <span className="text-muted" style={{ fontSize: "0.75rem" }}>{cloudFontSize.toFixed(1)}x</span>
        </div>
      )}

      <div className="d-flex align-items-center gap-2 mb-1">
        <small className="text-muted">Max name length</small>
        <input
          type="range"
          className="form-range form-range-sm"
          min="0"
          max="30"
          step="1"
          value={maxNameChars}
          onChange={(e) => setMaxNameChars(parseInt(e.target.value, 10))}
          style={{ maxWidth: 120 }}
        />
        <span className="text-muted" style={{ fontSize: "0.75rem" }}>
          {maxNameChars === 0 ? "off" : maxNameChars}
        </span>
      </div>

      <div ref={vizContainerRef}>
        <VizComponent
          students={displayStudents}
          studentsLeft={displayStudentsLeft}
          selectedStudent={displaySelectedStudent}
          drawnMap={engine.drawnMap}
          allOptions={engine.allOptions}
          dCounts={engine.dCounts}
          avoidRepetition={engine.avoidRepetition}
          adjust={engine.adjust}
          radiusScale={radiusScale}
          cloudPadding={cloudPadding}
          cloudRotateChance={cloudRotateChance}
          cloudFontSize={cloudFontSize}
          width={width}
          height={height}
          onBubbleClick={handleBubbleClick}
        />
      </div>
    </div>
  );
};

LotteryShell.propTypes = {
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
  setOptionSel: PropTypes.func.isRequired,
  optionsDrawn: PropTypes.array.isRequired,
  dayGrades: PropTypes.array.isRequired,
  counts: PropTypes.array.isRequired,
  optionSel: PropTypes.object,
};

export default LotteryShell;
