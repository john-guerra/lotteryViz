import React, { useEffect, useState, useRef } from "react";
// import PropTypes from "prop-types";
import Lottery from "./Lottery";
import "./App.css";
import ListSelected from "./ListSelected";
import * as d3 from "d3";
import LotteryResultsFromMongo from "./LotteryResultsFromMongo";

import { classes } from "./students.mjs";

// https://stackoverflow.com/questions/24468518/html5-input-datetime-local-default-value-of-today-and-current-time
// https://stackoverflow.com/questions/10830357/javascript-toisostring-ignores-timezone-offset
function toLocalIsoString(date) {
  const tzoffset = date.getTimezoneOffset() * 60000; //offset in milliseconds
  const localDate = new Date(date - tzoffset);

  // Optionally remove second/millisecond if needed
  localDate.setSeconds(null);
  localDate.setMilliseconds(null);
  return localDate.toISOString().slice(0, -1);
}

const App = () => {
  const [course, setCourse] = useState(Object.keys(classes)[0]);
  const [options, setOptions] = useState(classes[course]);
  const [dayGrades, setDayGrades] = useState([]);
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [counts, setCounts] = useState([]);
  const [optionSel, setOptionSel] = useState(null);
  const [lastOptionSel, setLastOptionSel] = useState(null);
  const [search, setSearch] = useState("");
  const inSearch = useRef();

  if (optionSel) {
    d3.select("body").on("keyup", () => {
      const timestamp = useCustomDate ? selectedDate : new Date();
      switch (d3.event.key) {
        case "-":
          sendGrade(optionSel.name, -1, timestamp);
          break;
        case "0":
          sendGrade(optionSel.name, 0, timestamp);
          break;
        case "1":
          sendGrade(optionSel.name, 1, timestamp);
          break;
        case "2":
          sendGrade(optionSel.name, 2, timestamp);
          break;
        default:
          break;
      }
    });
  }

  function sendPost(url, body) {
    const strGrade = JSON.stringify(body);
    console.log("send grade", strGrade, body);

    // Default options are marked with *
    return fetch(url, {
      method: "POST", // *GET, POST, PUT, DELETE, etc.
      mode: "cors", // no-cors, *cors, same-origin
      cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
      credentials: "same-origin", // include, *same-origin, omit
      headers: {
        "Content-Type": "application/json",
        // 'Content-Type': 'application/x-www-form-urlencoded',
      },
      redirect: "follow", // manual, *follow, error
      referrerPolicy: "no-referrer", // no-referrer, *client
      // body: "" // body data type must match "Content-Type" header
      body: strGrade, // body data type must match "Content-Type" header
    }).then((res) => res.json());
  }

  function sendGrade(name, grade, timestamp) {
    console.log("📣 sendGrade", name, grade, timestamp);
    return sendPost("setGrade", {
      name,
      grade,
      timestamp,
      course: course,
    }).then((res) => {
      refreshGrades();

      return res;
    });
  }

  function sendDelete(name, grade, timestamp) {
    if (
      window.confirm(
        `Do you really want to delete? ${name} ${grade} ${timestamp}`
      )
    ) {
      sendPost("delete", { name, grade, timestamp, course: course }).then(
        (res) => {
          console.log("delete response", res);
          refreshGrades();

          return res;
        }
      );
    }
  }

  const refreshGrades = () => {
    console.log(
      "refreshGrades",
      "getGrades/" + course + (useCustomDate ? "?date=" + selectedDate : "")
    );
    refreshCounts();
    fetch(
      "getGrades/" +
        course +
        (useCustomDate ? "?date=" + selectedDate.getTime() : "")
    )
      .then((res) => res.json())
      .then((grades) => {
        setDayGrades(grades);
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

  useEffect(refreshGrades, [course, selectedDate, useCustomDate]);

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

  const onChangeDate = (evt) => {
    console.log("onChangeDate", evt.target.value, new Date(evt.target.value));
    setSelectedDate(new Date(evt.target.value));
  };

  console.log(
    "🎨 App render grades",
    selectedDate.toLocaleString(),
    optionSel,
    "counts",
    counts,
    "selectedDate",
    selectedDate,
    "useCustomDate",
    useCustomDate,
    "course",
    course,
    "dayGrades",
    dayGrades,
    "options",
    options,
    "search",
    search,
    "lastOptionSel",
    lastOptionSel
  );
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
            optionsDrawn={dayGrades}
            optionSel={optionSel}
            counts={counts}
            dayGrades={dayGrades}
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
                optionsDrawn={dayGrades}
                optionSel={optionSel}
              ></LotteryResultsFromMongo>
            </div>
            {/* Lottery Results from Mongo */}
            <h2>History</h2>{" "}
            <details
              className="mb-2"
              onToggle={() => {
                setUseCustomDate(!useCustomDate);
                useCustomDate && setSelectedDate(new Date()); // reset to now when folding the details element
              }}
            >
              <summary>Date {selectedDate.toLocaleDateString()}</summary>
              <div>
                <label className="form-label">
                  {" "}
                  Date{" "}
                  <input
                    className="form-control"
                    type="datetime-local"
                    value={toLocalIsoString(selectedDate)}
                    onInput={onChangeDate}
                  ></input>
                </label>{" "}
              </div>
            </details>
            <div id="drawn">
              {" "}
              <ListSelected
                course={course}
                optionsDrawn={dayGrades}
                optionSel={optionSel}
                onSelect={refreshGrades}
                sendDelete={sendDelete}
                sendGrade={sendGrade}
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
