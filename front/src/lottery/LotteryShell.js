import React, { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import useLotteryEngine from "./useLotteryEngine";
import visualizations from "./visualizations";
import "./LotteryShell.css";

const vizKeys = Object.keys(visualizations);

const LotteryShell = (props) => {
  const [vizType, setVizType] = useState("bubbles");
  const [radiusScale, setRadiusScale] = useState(1.0);
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

      <div ref={vizContainerRef}>
        <VizComponent
          students={engine.students}
          studentsLeft={engine.studentsLeft}
          selectedStudent={props.optionSel}
          drawnMap={engine.drawnMap}
          allOptions={engine.allOptions}
          dCounts={engine.dCounts}
          avoidRepetition={engine.avoidRepetition}
          adjust={engine.adjust}
          radiusScale={radiusScale}
          width={width}
          height={height}
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
