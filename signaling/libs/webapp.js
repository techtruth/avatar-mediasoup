/**
 *  Express application that serves the client webapp
 *  - Serves the built webapp/dist folder to clients
 *  - Serves the documenation folder to clients
 * @todo break this into an api and webapp
 * @file Delivers client WebApp to browsers
 * @namespace webapp
 */

// Load required modules
const path = require("path");
const axios = require("axios");
const { json, text } = require("body-parser");
const express = require("express"); // web framework external module
const nocache = require("nocache");
const cors = require("cors");

const openapiJSDoc = require("openapi-jsdoc");
const swaggerUi = require("swagger-ui-express");

const auth = require("../api/auth");
const twilio = require("../api/twilio");
const uptime = require("../api/uptime");

// Setup and configure Express http server. Expect a subfolder called "static"
// to be the web root.
const app = express();

if (process.env.NODE_ENV === "production") {
} else {
}

//Express API Routes
app.use(json());
app.use(text());
app.use(express.urlencoded({ extended: true })); // support encoded bodies

// Set cors for allow all
// TODO: restrict this to only be the case for development
app.use(
  cors({
    origin: true,
    allowedHeaders: "Origin, X-Requested-With, Content-Type, Accept",
    credentials: true,
  })
);

// Upgrade all insecure, non-localhost requests to https
app.use((req, res, next) => {
  if (!req.secure && req.ip !== "127.0.0.1" && !req.ip.startsWith("172.")) {
    console.log("Redirecting to https://" + req.get("host") + req.originalUrl);
    res.redirect(301, "https://" + req.get("host") + req.originalUrl);
  } else {
    next();
  }
});

//Make all these base off /api not just twilio
app.use("/auth", auth);
app.use("/extcom", twilio);
app.use("/uptime", uptime);

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minutes
  max: 5, // Limit each IP to 100 requests per windowMs
});
app.use("/automate", apiLimiter, automate);

// Initialize openapi-jsdoc -> returns validated OpenAPI spec in json format
const restapi = openapiJSDoc({
  definition: {
    // info object, see https://swagger.io/specification/#infoObject
    info: {
      title: "Internal Api", // required
      version: process.env.npm_package_version, // required
      description: "Api used exclusively by application",
    },
  },
  // Paths to the internal API docs
  apis: ["api/*.js"],
});

app.use("/doc/REST", swaggerUi.serve, (req, res) => {
  let html = swaggerUi.generateHTML(restapi);
  res.send(html);
});

app.use(
  "/doc",
  express.static(
    path.join(__dirname, "../doc/frame/" + process.env.npm_package_version),
    { index: "index.html" }
  )
);

app.use(
  "/",
  express.static(path.join(__dirname, "../webapp/dist"), {
    index: "index.html",
  })
);

// Error handler
app.use((error, _req, res, next) => {
  if (error) {
    console.warn("Express app error,", error.message);
    error.status = error.status || (error.name === "TypeError" ? 400 : 500);
    res.statusMessage = error.message;
    res.status(error.status).send(String(error));
  } else {
    next();
  }
});

module.exports = app;
