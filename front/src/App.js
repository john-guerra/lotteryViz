import React, { useEffect, useState, useRef } from "react";
// import PropTypes from "prop-types";
import Lottery from "./Lottery";
import "./App.css";
import ListSelected from "./ListSelected";
import * as d3 from "d3";
import LotteryResultsFromMongo from "./LotteryResultsFromMongo";

import { classes } from "./students.mjs";

const App = () => {
  const [course, setCourse] = useState(Object.keys(classes)[0]);
  const [options, setOptions] = useState(classes[course]);
  const [todayGrades, setTodayGrades] = useState([]);
  const [counts, setCounts] = useState([]);
  const [optionSel, setOptionSel] = useState(null);
  const [lastOptionSel, setLastOptionSel] = useState(null);
  const [search, setSearch] = useState("");
  const inSearch = useRef();
  const refreshGrades = () => {
    refreshCounts();
    fetch("getGrades/" + course)
      .then((res) => res.json())
      .then((grades) => {
        setTodayGrades(grades);
      });
  };
  const refreshCounts = () => {
    fetch("getCounts/" + course)
      .then((res) => res.json())
      .then((_counts) => {
        setCounts(_counts);
      });
  };
  const onSearch = () => {
    const searchedStr = inSearch.current.value;
    setSearch(searchedStr);
    if (searchedStr === "") {
      setOptionSel(lastOptionSel);
      return;
    }
    const reg = new RegExp(`.*${searchedStr}.*`, "i");
    const matches = options.find((o) => reg.test(o));
    console.log("matches", matches);
    if (matches) {
      setLastOptionSel(optionSel);
      setOptionSel({ name: matches });
    }
  };

  useEffect(refreshGrades, [course]);

  const onChangeCourse = (evt) => {
    console.log("course", evt.target.value);
    setCourse(evt.target.value);
    setOptions(classes[evt.target.value]);
  };

  const renderCourseSelector = () => {
    return (
      <div>
        <label>
          Course:{" "}
          <select name="course" onChange={onChangeCourse}>
            {Object.keys(classes).map((c) => (
              <option value={c} key={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  };

  function getMedian() {
    const sums = counts.map((d) => +d.sum).sort();
    // const half = Math.floor(sums.length / 2);
    // console.log(sums);
    return d3.median(sums);
  }

  console.log("App grades", optionSel, "counts", counts);
  return (
    <div className="App">
      {" "}
      <h1>
        Class participation
        <br />
        <small>Current class median: {getMedian()} points</small>
      </h1>{" "}
      {renderCourseSelector()}
      <div className="row">
        <div className="col-5">
          <Lottery
            options={options}
            setOptionSel={setOptionSel}
            optionsDrawn={todayGrades}
            optionSel={optionSel}
            counts={counts}
            todayGrades={todayGrades}
          ></Lottery>
        </div>
        {/* /col-5  lottery */}

        <div className="col-7">
          <div>
            {" "}
            <br /> <br />{" "}
            <label>
              {" "}
              Search{" "}
              <input
                type="text"
                ref={inSearch}
                value={search}
                onChange={onSearch}
              />{" "}
            </label>{" "}
          </div>{" "}
          <div id="drawnBox" className="bgWhite">
            {" "}
            {optionSel ? (
              <div>
                {" "}
                <h2>Drawn</h2>{" "}
                <div className="selected">
                  {" "}
                  <div>
                    {" "}
                    <div className="optionSel">{optionSel.name}</div>{" "}
                  </div>{" "}
                </div>{" "}
              </div>
            ) : (
              <span></span>
            )}{" "}
            <div id="lotteryResultsFromMongo">
              <LotteryResultsFromMongo
                courseName={course}
                optionsDrawn={todayGrades}
                optionSel={optionSel}
              ></LotteryResultsFromMongo>
            </div>
            {/* Lottery Results from Mongo */}
            <h2>History</h2>{" "}
            <div id="drawn">
              {" "}
              <ListSelected
                course={course}
                optionsDrawn={todayGrades}
                optionSel={optionSel}
                onSelect={refreshGrades}
              ></ListSelected>{" "}
            </div>{" "}
            {/* /drawn */}
          </div>{" "}
        </div>
        {/* /col-7 drawnBox */}
      </div>{" "}
    </div>
  );
};
App.propTypes = {};
export default App;
