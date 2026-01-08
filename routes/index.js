import express from "express";
import cors from "cors";

let router = express.Router();

import myDB from "../db/myDB.js";

// const dbName = "lottery_web";
// const dbName = "lottery_web_spring2021";
// const dbName = "lottery_infovis_spring2021";
// let dbName = "lottery_web_fall2022";

const FILTER_BY_REGISTERED = true;

import { classes } from "../front/src/students.mjs";

// STUDENT LIST GOES INTO front/src/students.mjs

router.post("/setGrade", function (req, res) {
  console.log("***setGrade", req.ip, req.body);

  if (req.ip !== "127.0.0.1") {
    console.log("Request not from localhost ", req.ip, " ignoring");
    return;
  }

  myDB.setGrade(req.body, () => {
    console.log("done!");
    res.json({ inserted: true });
  });
});

router.post("/delete", function (req, res) {
  console.log("*** delete", req.ip, req.body);

  if (req.ip !== "127.0.0.1") {
    console.log("Request not from localhost ", req.ip, " ignoring");
  }

  myDB.deleteGrade(req.body, (err) => {
    if (err) {
      console.log("Error deleting", err);
      return;
    }
    console.log("Deleted!");
    res.json({ deleted: true });
  });
});

router.get("/getGrades/:course", function (req, res) {
  const date = req.query.date ? new Date(+req.query.date) : new Date();
  const course = req.params.course;
  console.log(
    "📆 getGrades",
    course,
    date,
    req.query.date,
    new Date(req.query.date)
  );

  myDB.getGrades({ course, date }, (grades) => {
    console.log("Got grades!");
    res.json(grades);
  });
});

const corsOptions = {
  origin: [
    "http://localhost:4000",
    "https://john-guerra.static.observableusercontent.com",
  ],
  // origin: "https://john-guerra.static.observableusercontent.com",
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};

router.get("/getAllGrades/:course", cors(corsOptions), function (req, res) {
  console.log("getAllGrades");

  myDB.getAllGrades(req.params.course, (grades) => {
    console.log("Got grades for course!", req.params.course);

    if (!classes[req.params.course]) {
      console.log("❌❌❌ No class list for course", req.params.course);
    }

    res.json(
      grades.filter(
        (g) =>
          !FILTER_BY_REGISTERED ||
          (classes[req.params.course] &&
            classes[req.params.course].includes(g.name))
      )
    );
  });
});

router.get("/getCounts/:course", cors(corsOptions), function (req, res) {
  console.log("getCounts");

  myDB.getCounts(req.params.course, (counts) => {
    console.log("Got counts!");
    res.json(
      counts.filter(
        (g) =>
          !FILTER_BY_REGISTERED || classes[req.params.course].includes(g._id)
      )
    );
  });
});

// module.exports = router;
export default router;
