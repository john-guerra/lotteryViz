var express = require("express");
const cors = require("cors");

var router = express.Router();

const myDB = require("../db/myDB.js");

// const dbName = "lottery_web";
// const dbName = "lottery_web_spring2021";
// const dbName = "lottery_infovis_spring2021";
let dbName = "lottery_web_fall2022";

// STUDENT LIST GOES INTO front/src/students.mjs

router.post("/setGrade", function(req, res) {
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

router.post("/delete", function(req, res) {
  console.log("*** delete", req.ip);

  if (req.ip !== "127.0.0.1") {
    console.log("Request not from localhost ", req.ip, " ignoring");
  }

  myDB.deleteGrade(req.body, () => {
    console.log("Deleted!");
    res.json({ deleted: true });
  });
});

router.get("/getGrades/:course", function(req, res) {
  console.log("getGrades");

  myDB.getGrades(req.params.course, (grades) => {
    console.log("Got grades!");
    res.json(grades);
  });
});

const corsOptions = {
  origin: ["http://localhost:4000", "https://john-guerra.static.observableusercontent.com"],
  // origin: "https://john-guerra.static.observableusercontent.com",
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};

router.get("/getAllGrades/:course", cors(corsOptions), function(req, res) {
  console.log("getAllGrades", req);



  myDB.getAllGrades(req.params.course, (grades) => {
    console.log("Got grades for course!", req.params.course);
    res.json(grades);
  });
});

router.get("/getCounts/:course",cors(corsOptions), function(req, res) {
  console.log("getCounts");

  myDB.getCounts(req.params.course, (counts) => {
    console.log("Got counts!");
    res.json(counts);
  });
});

module.exports = router;
