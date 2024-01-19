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



const Lottery = (props) => {
  const ADJUSTMENT_FACTOR = 10;

  let [adjust, setAdjust] = useState(true);
  let [avoidRepetition, setAvoidRepetition] = useState(true);
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

  let width = 600,
    height = 800,
    endAngle = 360 - (360 / props.options.length);

  const angleScale = d3
    .scaleLinear()
    .domain([0, props.options.length - 1])
    .range([0, endAngle]);

  let allOptions = [], // used for drawing
    optionsLeft = []; // Remaining options

  // computes dCounts making sure options not drawn start on 0
  function getDCounts() {
    const dCounts = new Map(
      props.options.map((d) => [d, {_id:d, count: 0, sum: 0 }])
    );
    for (let d of props.counts) {
      // Only include registered students
      if (dCounts.has(d._id)) {
        dCounts.set(d._id, d);
      }
      
    }
    console.log("dCounts",  dCounts);
    return dCounts;
  }

  function updateAllOptions(ops) {
    allOptions = ops.map(function(d, i) {
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

    endAngle = endAngle = 360 - 360 / allOptions.length;
    angleScale.domain([0, allOptions.length - 1]).range([0, endAngle]);
    return allOptions;
  }

  function getOptionsFromCounts() {
    if (props.counts.length === 0) return props.options;

    // Start from the counts in the database. Use dCounts as it has only the ones registered
    let sortedCounts = Array.from(dCounts.values()).sort((a, b) => a.count - b.count);


    const maxCount = sortedCounts.at(-1).count;
    const adjustedCounts = sortedCounts.map((d) => {
      d.adjustedCount = (maxCount - d.count) * ADJUSTMENT_FACTOR + 1;
      return d;
    });
    const res = adjustedCounts
      .map((d) => Array.from({ length: d.adjustedCount }).map((_) => d._id))
      .flat();

    // console.log("Options from counts", res);

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
    const options = allOptions;
    console.log("redraw", options.length);

    const svg = d3
      .select(resultRef.current)
      .selectAll("svg")
      .data([options])
      .join("svg")
      .attr("width", width)
      .attr("height", height);

    const optionsSel = svg.selectAll(".option").data(options, (d) => d.id);

    const opEnter = optionsSel
      .enter()
      .append("text")
      .classed("option", "true")
      .classed("drawn", (d) => hashNamesDrawn[d.name]);

    const translate = (sel) =>
      sel.attr("transform", function(d) {
        return (
          "translate(" +
          (width / 2 - 2 * options.length) +
          "," +
          height / 2 +
          ") rotate(" +
          angleScale(d.id) +
          ")" +
          ", translate(" +
          2 * options.length +
          ",0)"
        );
      });

    optionsSel
      .merge(opEnter)
      // .attr("x", width/2)
      // .attr("y", height/2)
      .attr("id", function(d) {
        // console.log("id", d, dCounts, dCounts.get(d.name));
        return "id" + d.id;
      })
      .attr("key", (d) => d.id)
      .classed("drawn", (d) => hashNamesDrawn[d.name])
      .text((d) => `${d.name} ${dCounts.get(d.name)?.count}`)
      .transition()
      .duration(1000)
      .call(translate);

    optionsSel.exit().remove();
  }

  function onChoose() {
    const sel = Math.floor(Math.random() * optionsLeft.length);
    const tmpOptionSel = optionsLeft.splice(sel, 1)[0];
    console.log("onChoose", sel, "options left", optionsLeft.length, "angleScale", angleScale.domain(), angleScale.range());

    if (tmpOptionSel === undefined) {
      console.log("No more options left");
      alert("No more options left"); // Optional
      return;
    }

    tmpOptionSel.drawn = true;

    angleScale.range([0, endAngle]);
    const selAngle = angleScale(tmpOptionSel.id);

    console.log(
      "sel=" + sel + " angle=" + selAngle + " option " + tmpOptionSel.name
    );

    angleScale.range([-selAngle, endAngle - selAngle]);
    console.log("#id " + sel);
    d3.selectAll(".option").classed("selected", false);
    

    console.log("#id" + tmpOptionSel.id);
    d3.select("#id" + tmpOptionSel.id).classed("selected", true);

    props.setOptionSel(tmpOptionSel);
    // setOptionsDrawn([tmpOptionSel].concat(optionsDrawn));

    redraw();
  }

  function onAdjustByHistory(evt) {
    setAdjust(evt.target.checked);

    console.log("adjust", adjust);
  }

  function onAvoidRepetition(evt) {
    setAvoidRepetition(evt.target.checked);

    console.log("avoidRepetition", adjust);
  }

  // Do only once
  useEffect(() => {
    redraw();
  }, [props.options, adjust, props]);

  // console.log("Lottery Render, counts", props.counts, " adjust ", adjust);
  return (
    <div className="Lottery">
      <div>
        <button id="btnChoose" onClick={onChoose}>
          Do you feel lucky?
        </button>

        <small>Options left: {optionsLeft.length}</small>
      </div>
      <div>
        {" "}
        <label>
          {" "}
          Adjust chances by history
          <input
            onChange={onAdjustByHistory}
            checked={adjust}
            type="checkbox"
          />
        </label>
      </div>
      <div>
        {" "}
        <label>
          {" "}
          Avoid repetition
          <input
            onChange={onAvoidRepetition}
            checked={avoidRepetition}
            type="checkbox"
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
  todayGrades: PropTypes.array.isRequired,
  counts: PropTypes.array.isRequired,
};

export default Lottery;
