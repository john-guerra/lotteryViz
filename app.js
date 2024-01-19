import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import lessMiddleware from "less-middleware";
import logger from "morgan";
import cors from "cors";

import indexRouter from "./routes/index.js";

import { URL } from "url";

const __filename = new URL("", import.meta.url).pathname;
const __dirname = new URL(".", import.meta.url).pathname;

const app = express();

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
// app.use(lessMiddleware(path.join(__dirname, "front/build")));
app.use(express.static(path.join(__dirname, "front/build")));
// app.use(lessMiddleware(path.join(__dirname, "public")));
// app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);

// module.exports = app;
export default app;
