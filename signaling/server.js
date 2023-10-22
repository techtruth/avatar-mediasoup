/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Virbella Frame - Application Entrypoint
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const https = require("https");
const http = require("http");
const fs = require("fs");
const cluster = require("cluster");
const generateCertificate = require("../libs/generateCertificate");

// Forks two child process
//  - peerworker: coordinate peers and transports for media
//  - webworker: provides signaling between client and peerworker
//               also, serves the website from a static file

//Check if this is the cordinator
if (cluster.isMaster) {
  //Masters/Parents supervise
  const peerworker = cluster.fork({ purpose: "peerManager" }); //Fork!
  const webworker = cluster.fork({ purpose: "webApplication" }); //Fork!
  //There is a fork in a code above

  //Handle exit behavior of worker threads
  cluster.on(
    "exit",
    function (
      worker: { id: any; process: { pid: any } },
      code: any,
      signal: any
    ) {
      console.log(
        `Worker ${worker.id} has exited with code ${code} and signal ${signal}, PID ${worker.process.pid}`
      );
      console.log("Thread worker disconnected", worker.id);
    }
  );

  //Relay IPC messages to other process
  peerworker.on("message", async function (message) {
    webworker.send(message); //Forward message to webworker
  });
  webworker.on("message", async function (message) {
    peerworker.send(message); //Forward message to peerworker
  });
} else {
  //Children handles work
  console.log("Starting child", process.pid, "for", process.env.purpose);
  if (process.env.purpose === "webApplication") {
    const webapp = require("../libs/webapp"); //Express with websockets
    const wsServer = require("../libs/wsServer");
    serverSetup(webapp, wsServer);
    //When webapp process receives instructions from master
    process.on("message", async (msg) => {
      wsServer.sendBack(msg); //Give reply to websocket/client
    });
  } else if (process.env.purpose === "peerManager") {
    const peerConnectionManager =
      new (require("../libs/peerConnectionManager"))();
    //When media process receives instructions from master
    process.on("message", (msg) => {
      peerConnectionManager.command(msg); //Send IPC to mediaWorker
    });
  } else {
    console.log("unknown worker...");
  }
}

//Setup http/https server for delivering signaling interface and client app
async function serverSetup(app: any, wsServer: { upgrade: any }) {
  // Serve API application with HTTP server
  const serverHTTP = http.createServer(app);
  serverHTTP.on("upgrade", wsServer.upgrade);
  serverHTTP.on("error", onError);
  serverHTTP.on("listening", onListen);
  serverHTTP.listen(
    process.env.npm_config_insecureport ||
      process.env.npm_package_config_insecureport,
    process.env.npm_config_listenip || process.env.npm_package_config_listenip
  );
  //Enable ssl if not running in localonly mode

  if (
    process.env.npm_config_apissl === "true" ||
    process.env.npm_package_config_apissl === "true"
  ) {
    let credentials;

    // Use certificates provided with sslkey and sslcrt config, if present
    // See Dockerfile.api for an example
    const sslkey =
      process.env.npm_config_sslkey || process.env.npm_package_config_sslkey;
    const sslcrt =
      process.env.npm_config_sslcrt || process.env.npm_package_config_sslcrt;
    if (sslkey && sslcrt) {
      const key = fs.readFileSync(sslkey, "utf8");
      const cert = fs.readFileSync(sslcrt, "utf8");
      credentials = { key, cert };
    } else {
      // If no certificates are configured, generate a self-signed certificate
      const cert = await generateCertificate();
      credentials = { key: cert, cert };
    }

    // Serve API application with HTTPS server
    const serverHTTPS = https.createServer(credentials, app);
    serverHTTPS.on("upgrade", wsServer.upgrade);
    serverHTTPS.on("error", onError);
    serverHTTPS.on("listening", onListen);
    serverHTTPS.listen(
      process.env.npm_config_secureport ||
        process.env.npm_package_config_secureport,
      process.env.npm_config_listenip || process.env.npm_package_config_listenip
    );
  }
}

// Event error listener
function onError(error: { syscall: string; code: any }) {
  if (error.syscall !== "listen") {
    throw error;
  }

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      console.error("This action requires elevated privileges");
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error("Port already in use! Close other program and restart.");
      process.exit(1);
      break;
    default:
      throw error;
  }
}

// Event listener for HTTP server "listening" event.
function onListen(this: any) {
  console.log(
    "Client Webapp listening on port",
    this.address().port,
    "pid:",
    process.pid
  );
}

//Override console.debug,info,warn
console.debug = function (...arg) {
  if (process.env.debug) {
    console.log("DEBUG:", Object.values(arg).join());
  }
};
console.warn = function (...arg) {
  console.log("WARNING:", Object.values(arg).join());
};
