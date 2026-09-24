import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
// import lessMiddleware from "less-middleware";
import logger from "morgan";
// import cors from "cors";

import indexRouter from "./routes/index.js";
import participationRouter from "./routes/participation.js";
import canvasRouter from "./routes/canvas.js";
import { sameMachineOnly } from "./routes/request-guard.mjs";

import { URL } from "url";

const __dirname = new URL(".", import.meta.url).pathname;

const app = express();

app.use(logger("dev"));
// Before any parser or route: rejects foreign Host headers and cross-site
// writes. There is deliberately no express.urlencoded() — every client posts
// JSON, and accepting form bodies is what let other sites forge requests.
app.use(sameMachineOnly);
app.use(express.json());
app.use(cookieParser());
// app.use(lessMiddleware(path.join(__dirname, "front/build")));
app.use(express.static(path.join(__dirname, "front/build")));
// app.use(lessMiddleware(path.join(__dirname, "public")));
// app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/api/participation", participationRouter);
app.use("/api/canvas", canvasRouter);

// SPA catch-all: serve index.html for any route not handled by API
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "front/build", "index.html"));
});

// module.exports = app;
export default app;
