import React from "react";
import PropTypes from "prop-types";
import * as d3 from "d3";

import "./ListSelected.css";

const ListSelected = (props) => {
  console.log("ListSelected", props);

  function renderOptions() {
    return props.optionsDrawn.map((option, i) => (
      <div className="optionsDrawn" key={i}>
        <span className="name">{option.name}</span>
        &nbsp;
        <span className="grade">
          {option.grade !== null ? option.grade : "_"}
        </span>
        <button
          onClick={() =>
            props.sendGrade(option.name, -1, option.timestamp, props.course)
          }
          className="btnMinusOne"
        >
          -1
        </button>
        <button
          onClick={() =>
            props.sendGrade(option.name, 0, option.timestamp, props.course)
          }
          className="btnZero"
        >
          0
        </button>
        <button
          onClick={() =>
            props.sendGrade(option.name, 1, option.timestamp, props.course)
          }
          className="btnOne"
        >
          1
        </button>
        <button
          onClick={() =>
            props.sendGrade(option.name, 2, option.timestamp, props.course)
          }
          className="btnTwo"
        >
          2
        </button>
        <button
          onClick={() =>
            props.sendDelete(option.name, 2, option.timestamp, props.course)
          }
          className="btnDelete"
        >
          ❌
        </button>
      </div>
    ));
  }

  return <span>{renderOptions()}</span>;
};

ListSelected.propTypes = {
  course: PropTypes.string.isRequired,
  optionsDrawn: PropTypes.array.isRequired,
  onSelect: PropTypes.func.isRequired,
  sendGrade: PropTypes.func.isRequired,
  sendDelete: PropTypes.func.isRequired,
};

export default ListSelected;
