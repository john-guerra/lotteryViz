import React, { useEffect, useState, useRef } from "react";
import Lottery from "../Lottery";
import ListSelected from "../ListSelected";
import * as d3 from "d3";
import LotteryResultsFromMongo from "../LotteryResultsFromMongo";
import { calculateMedian } from "../LotteryChart";
import { classes } from "../students.mjs";

function toLocaleIsoString(date) {
  const localDate = new Date(date - date.getTimezoneOffset() * 60000);
  localDate.setSeconds(null);
  localDate.setMilliseconds(null);
  return localDate.toISOString().slice(0, -1);
}

const MainPage = () => {
  const [course, setCourse] = useState(Object.keys(classes)[0]);
  const [options, setOptions] = useState(classes[course]);
  const [dayGrades, setDayGrades] = useState([]);
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [counts, setCounts] = useState([]);
  const [allGrades, setAllGrades] = useState([]);
  const [optionSel, setOptionSel] = useState(null);
  const [lastOptionSel, setLastOptionSel] = useState(null);
  const [search, setSearch] = useState("");
  const inSearch = useRef();

  // Chart settings state
  const [chartOpacity, setChartOpacity] = useState(0.6);
  const [showStudentLines, setShowStudentLines] = useState(false);
  const [studentName, setStudentName] = useState("");

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

    return fetch(url, {
      method: "POST",
      mode: "cors",
      cache: "no-cache",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      redirect: "follow",
      referrerPolicy: "no-referrer",
      body: strGrade,
    }).then((res) => res.json());
  }

  function sendGrade(name, grade, timestamp) {
    console.log("sendGrade", name, grade, timestamp);
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

    fetch("getAllGrades/" + course)
      .then((res) => res.json())
      .then((grades) => setAllGrades(grades));
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
    console.log("matches", matches, options);
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
      <div className="mb-3">
        <label>
          Course:{" "}
          <select className="form-control" name="course" onChange={onChangeCourse}>
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
    return calculateMedian(allGrades, classes[course]);
  }

  const onChangeDate = (evt) => {
    console.log("onChangeDate", evt.target.value, new Date(evt.target.value));
    setSelectedDate(new Date(evt.target.value));
  };

  return (
    <div>
      <h1>
        Class participation
        <br />
        <small>Current class median: {getMedian()} points</small>
      </h1>
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

        <div className="col-7">
          <div className="mb-3 mt-3">
            <div className="d-flex align-items-end gap-2">
              <div className="flex-grow-1">
                <label className="form-label mb-1">Search</label>
                <input
                  className="form-control"
                  type="text"
                  ref={inSearch}
                  value={search}
                  onChange={onSearch}
                />
              </div>
              <div className="dropdown">
                <button
                  className="btn btn-outline-secondary dropdown-toggle"
                  type="button"
                  data-bs-toggle="dropdown"
                  data-bs-auto-close="outside"
                  aria-expanded="false"
                  title="Chart Settings"
                >
                  <span role="img" aria-label="settings">&#9881;</span>
                </button>
                <div className="dropdown-menu dropdown-menu-end p-3" style={{ minWidth: "220px" }}>
                  <div className="mb-3">
                    <label className="form-label small mb-1">Student Name</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="Search by name..."
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small mb-1">
                      Opacity: {chartOpacity.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      className="form-range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={chartOpacity}
                      onChange={(e) => setChartOpacity(parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="showStudentLines"
                      checked={showStudentLines}
                      onChange={(e) => setShowStudentLines(e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor="showStudentLines">
                      Show student lines
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div id="drawnBox" className="bgWhite">
            {optionSel ? (
              <div>
                <h2>Drawn</h2>
                <div className="selected">
                  <div>
                    <div className="optionSel">{optionSel.name}</div>
                  </div>
                </div>
              </div>
            ) : (
              <span></span>
            )}
            <div id="lotteryResultsFromMongo">
              <LotteryResultsFromMongo
                grades={allGrades}
                roster={classes[course]}
                rangeOpacity={chartOpacity}
                showStudentLines={showStudentLines}
                studentName={studentName}
              />
            </div>
            <h2>History</h2>
            <details
              className="mb-2"
              onToggle={() => {
                setUseCustomDate(!useCustomDate);
                useCustomDate && setSelectedDate(new Date());
              }}
            >
              <summary>Date {selectedDate.toLocaleDateString()}</summary>
              <div>
                <label className="form-label">
                  Date{" "}
                  <input
                    className="form-control"
                    type="datetime-local"
                    value={toLocaleIsoString(selectedDate)}
                    onInput={onChangeDate}
                  ></input>
                </label>
              </div>
            </details>
            <div id="drawn">
              <ListSelected
                course={course}
                optionsDrawn={dayGrades}
                optionSel={optionSel}
                onSelect={refreshGrades}
                sendDelete={sendDelete}
                sendGrade={sendGrade}
              ></ListSelected>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainPage;
