import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import * as d3 from "d3";

// // https://cmatskas.com/get-url-parameters-using-javascript/
// const parseQueryString = function(url) {
//   const urlParams = {};
//   url.replace(new RegExp("([^?=&]+)(=([^&]*))?", "g"), function(
//     $0,
//     $1,
//     $2,
//     $3
//   ) {
//     urlParams[$1] = $3;
//   });

//   return urlParams;
// };

import "./Lottery.css";

// Initial range values pending number of options
const angleScale = d3.scaleLinear().range([0, 0]);
let resetAngleScale = true;

const Lottery = (props) => {
  const ADJUSTMENT_FACTOR = 30;

  let [adjust, setAdjust] = useState(true);
  let [avoidRepetition, setAvoidRepetition] = useState(true);
  let [adjustByVariable, setAdjustByVariable] = useState("sum");
  const resultRef = useRef();

  const dCounts = getDCounts();

  // let options = d3.shuffle(props.options);

  //Create a hash of drawn names
  const hashNamesDrawn = [];
  props.optionsDrawn.forEach((d) => (hashNamesDrawn[d.name] = 1));

  // const [optionsDrawn, setOptionsDrawn] = useState([]);

  // const params = parseQueryString(location.search);
  // if (params && params.section === "2") {
  //   options = [];
  // }

  let width = resultRef.current?.clientWidth ?? 600,
    height = 600;

  let allOptions = [], // used for drawing
    optionsLeft = []; // Remaining options

  // computes dCounts making sure options not drawn start on 0
  function getDCounts() {
    const dCounts = new Map(
      props.options.map((d) => [d, { _id: d, count: 0, sum: 0 }])
    );
    for (let d of props.counts) {
      // Only include registered students
      if (dCounts.has(d._id)) {
        dCounts.set(d._id, d);
      }
    }
    return dCounts;
  }

  function updateAllOptions(ops) {
    allOptions = ops.map(function (d, i) {
      return { name: d, id: i, drawn: false };
    });

    if (avoidRepetition) {
      optionsLeft = allOptions.filter(
        (d) => hashNamesDrawn[d.name] === undefined
      );
    } else {
      // Don't mind which ones have been previously called selected
      optionsLeft = allOptions;
    }

    return allOptions;
  }

  function getOptionsFromCounts() {
    if (props.counts.length === 0) return props.options;

    // Start from the counts in the database. Use dCounts as it has only the ones registered
    let sortedCounts = Array.from(dCounts.values()).sort(
      (a, b) => a[adjustByVariable] - b[adjustByVariable]
    );

    console.log("counts", sortedCounts);

    const maxCount = sortedCounts.at(-1)[adjustByVariable];
    const adjustedCounts = sortedCounts.map((d) => {
      d.adjustedCount =
        (maxCount - d[adjustByVariable]) * ADJUSTMENT_FACTOR + 1;
      return d;
    });

    const res = adjustedCounts
      .map((d) => Array.from({ length: d.adjustedCount }).map((_) => d._id))
      .flat();

    // console.log("👀👀 Options from counts", res);

    return res;
  }

  if (adjust) {
    updateAllOptions(getOptionsFromCounts());
  } else {
    updateAllOptions(d3.shuffle(props.options));
  }

  console.log("Options Left", optionsLeft.length);

  // Redraw
  function redraw() {
    angleScale.domain([0, allOptions.length - 1]);
    // First run
    if (resetAngleScale) {
      // console.log("📢 Resetting angle scale", prevOptionsLength, allOptions.length);
      angleScale.range([0, 360 - 360 / allOptions.length]);
      // prevOptionsLength = allOptions.length;
      resetAngleScale = false;
    }

    const options = allOptions;
    // // );

    width = resultRef.current.clientWidth;
    // height = resultRef.current.clientHeight;

    console.log("width", width, "height", height);

    const svg = d3
      .select(resultRef.current)
      .selectAll("svg")
      .data([options])
      .join("svg")
      .attr("width", width)
      .attr("height", height);

    const optionsSel = svg.selectAll(".option").data(options, (d) => d.id);

    const translate = (sel) =>
      sel.attr("transform", function (d) {
        return (
          "translate(" +
          (width / 2 - 2 * options.length) +
          "," +
          height / 2 +
          ") rotate(" +
          angleScale(d.id) +
          ")" +
          " translate(" +
          2 * options.length +
          ",0)"
        );
      });

    optionsSel
      .join("text")
      .classed("option", "true")
      .classed("drawn", (d) => avoidRepetition && hashNamesDrawn[d.name])
      .classed("selected", (d) => d.id === props.optionSel?.id)
      .attr("id", (d) => "id" + d.id)
      .attr("key", (d) => d.id)
      .text((d) => `${d.name} ${dCounts.get(d.name)?.count - 1}`)
      .transition()
      .duration(1000)
      .call(translate);
  }

  function onChoose() {
    const sel = Math.floor(Math.random() * optionsLeft.length);
    const tmpOptionSel = optionsLeft.splice(sel, 1)[0];

    if (tmpOptionSel === undefined) {
      console.log("No more options left");
      alert("No more options left"); // Optional
      return;
    }

    tmpOptionSel.drawn = true;

    // angleScale.range([0, endAngle]);
    const selAngle = angleScale(tmpOptionSel.id);

    const prevRange = angleScale.range();
    console.log(
      "🚫 Changing angle scale from ",
      angleScale.range(),
      " to ",
      [prevRange[0] - selAngle, prevRange[1] - selAngle],
      prevRange[1] - selAngle - (prevRange[0] - selAngle)
    );
    angleScale.range([prevRange[0] - selAngle, prevRange[1] - selAngle]);

    // Should be done in redraw
    // d3.selectAll(".option").classed("selected", false);
    // d3.select("#id" + tmpOptionSel.id).classed("selected", true);

    props.setOptionSel(tmpOptionSel);
    // setOptionsDrawn([tmpOptionSel].concat(optionsDrawn));

    console.log("onChoose", dCounts.get(tmpOptionSel.name).sum);

    redraw();
  }

  function onAdjustByHistory(evt) {
    resetAngleScale = true;
    setAdjust(evt.target.checked);

    console.log("adjust", adjust);
  }

  function onAdjustByVariable(evt) {
    resetAngleScale = true;
    console.log("adjustByVariable", evt.target.value);
    setAdjustByVariable(evt.target.value);
  }

  function onAvoidRepetition(evt) {
    resetAngleScale = true;
    setAvoidRepetition(evt.target.checked);

    console.log("avoidRepetition", adjust);
  }

  // Do only once
  useEffect(() => {
    redraw();
  }, [
    props.options,
    adjust,
    props,
    avoidRepetition,
    adjustByVariable,
    props.optionSel,
  ]);

  // console.log("Lottery Render, counts", props.counts, " adjust ", adjust);
  return (
    <div className="Lottery">
      <div className="mb-2">
        <button
          className="btn-outline-primary btn"
          id="btnChoose"
          onClick={onChoose}
        >
          Do you feel lucky?
        </button>

        <small>Options left: {optionsLeft.length}</small>
      </div>
      <div className="form-check">
        {" "}
        <label className="form-check-label">
          {" "}
          Adjust chances by history
          <input
            className="form-check-input mx-1"
            onChange={onAdjustByHistory}
            checked={adjust}
            type="checkbox"
          />
        </label>
      </div>
      <div className="form-check">
        {" "}
        <label className="form-check-label">
          {" "}
          Avoid repetition
          <input
            className="form-check-input mx-1"
            onChange={onAvoidRepetition}
            checked={avoidRepetition}
            type="checkbox"
          />
        </label>
      </div>
      <div className="form-check">
        {" "}
        Adjust by:
        <label className="form-check-label mx-1">
          {" "}
          # Calls
          <input
            className="form-check-input mx-1"
            onChange={onAdjustByVariable}
            checked={adjustByVariable === "count"}
            type="radio"
            name="adjustBy"
            id="count"
            value="count"
          />
        </label>
        <label className="form-check-label mx-1">
          {" "}
          Sum Points
          <input
            className="form-check-input mx-1"
            onChange={onAdjustByVariable}
            checked={adjustByVariable === "sum"}
            type="radio"
            name="adjustBy"
            value="sum"
          />
        </label>
      </div>
      <div id="result" ref={resultRef}></div>
    </div>
  );
};

Lottery.propTypes = {
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
  setOptionSel: PropTypes.func.isRequired,
  optionsDrawn: PropTypes.array.isRequired,
  dayGrades: PropTypes.array.isRequired,
  counts: PropTypes.array.isRequired,
  optionSel: PropTypes.object,
};

export default Lottery;
