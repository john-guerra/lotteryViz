import mongodb from "mongodb";
import assert from "assert";

const { MongoClient } = mongodb;

let dbName = "lottery_webdev_spring2025";


const url = process.env.MONGO_URL || "mongodb://localhost:27017";

async function deleteGrade(grade, cbk) {
  dbName = "lottery_" + grade.course;

  const client = new MongoClient(url, { useUnifiedTopology: true });

  try {
    await client.connect();

    console.log("Connected successfully to server");

    const grades = client.db(dbName).collection("grades");

    // Convert the timestamp to date
    grade.timestamp =
      grade.timestamp !== undefined ? new Date(grade.timestamp) : new Date();

    const date = grade.timestamp.toDateString();
    const opts = {
      name: grade.name,
      date: date,
      timestamp: grade.timestamp,
      course: grade.course,
    };
    console.log("Deleting", opts);
    const res = await grades.deleteOne(opts);

    console.log("Mongo successfully deleted", res.deletedCount);
    if (res.deletedCount) {
      cbk();
    }
  } catch (err) {
    console.log("Error deleting", err);
    cbk(err);
  } finally {
    client.close();
  }
}

function setGrade(grade, cbk) {
  dbName = "lottery_" + grade.course;

  const client = new MongoClient(url, { useUnifiedTopology: true });
  client.connect(function (err) {
    assert.equal(null, err);
    console.log("Connected successfully to server");

    const grades = client.db(dbName).collection("grades");

    // Convert the timestamp to date

    grade.timestamp = grade.timestamp ? new Date(grade.timestamp) : new Date();
    const date = grade.timestamp.toDateString();

    // If grade.timestamp exists we are updating
    grades.update(
      {
        name: grade.name,
        date: date,
        timestamp: grade.timestamp,
        course: grade.course,
      },
      {
        date: date,
        timestamp: grade.timestamp || grade.timestamp,
        name: grade.name,
        grade: grade.grade,
        course: grade.course,
      },
      { upsert: true },
      function (res) {
        console.log("Mongo successfully updated", res);
        cbk.apply(this, arguments);
        client.close();
      }
    );
  });
}

function getGrades({ course, date = new Date() } = {}, cbk) {
  dbName = "lottery_" + course;

  const client = new MongoClient(url, { useUnifiedTopology: true });
  client.connect(function (err) {
    assert.equal(null, err);
    console.log("getGrades Connected successfully to server", course, date);

    const grades = client.db(dbName).collection("grades");

    console.log("myDB.getGrades", course, date.toDateString());
    grades
      .find({
        date: date.toDateString(),
      })
      .sort({ timestamp: -1 })
      .toArray((err, grades) => {
        console.log("got grades", grades.length);
        if (err) {
          cbk(err);
          return;
        }
        cbk(grades);
      });
  });
}

function getAllGrades(course, cbk) {
  dbName = "lottery_" + course;

  const client = new MongoClient(url, { useUnifiedTopology: true });
  client.connect(function (err) {
    assert.equal(null, err);
    console.log("Connected successfully to server");

    const grades = client.db(dbName).collection("grades");

    grades
      .find({})
      .sort({ timestamp: -1 })
      .toArray((err, grades) => {
        console.log("got grades", grades.length, " dbname", dbName);
        if (err) {
          cbk(err);
          return;
        }
        cbk(grades);
      });
  });
}

function getCounts(course, cbk) {
  dbName = "lottery_" + course;

  const client = new MongoClient(url, { useUnifiedTopology: true });
  client.connect(function (err) {
    assert.equal(null, err);
    console.log("Connected successfully to server");

    const grades = client.db(dbName).collection("grades");

    const query = [
      {
        $group: {
          _id: "$name",
          count: {
            $count: {},
          },
          sum: {
            $sum: "$grade",
          },
        },
      },
    ];

    grades.aggregate(query).toArray((err, counts) => {
      console.log("got counts", counts.length);
      if (err) {
        cbk(err);
        return;
      }
      cbk(counts);
    });
  });
}

const myDB = {
  deleteGrade,
  setGrade,
  getGrades,
  getAllGrades,
  getCounts,
};

// module.exports = myDB;

export default myDB;
