// This is the code that handles the upgrade from HTTP to WebSocket. We used to
// handle this in the Express app, but it stopped working after an upgrade to Node 18.

const { parse } = require("url");
const statsRelay = require("../libs/statsRelay")();
const wsRelay = require("../libs/wsRelay")();

const wsServer = {};

//Send IPC message to signaling server
wsServer.sendBack = function (ipcmessage) {
  //Send signaling logic message only if its communication
  if (ipcmessage.communication) {
    wsRelay.emit("ipcback", ipcmessage);
  }

  //Always send stats back, no matter what message
  statsRelay.emit("sendStats", ipcmessage);
};

// Upgrade http socket to websocket
wsServer.upgrade = (req, socket, head) => {
  const { pathname } = parse(req.url);
  console.log(`Looking to upgrade connection for ${pathname}`);

  if (pathname.startsWith("/signaling")) {
    console.log("Upgrading to WebSocket for signaling!");
    req.setTimeout(5000); //Close websockets after 1 second of inactivity (anti-phantoms)
    wsRelay.handleUpgrade(req, socket, head, (signalTransport) => {
      wsRelay.emit("connection", signalTransport, req);
    });
  } else if (pathname.startsWith("/stats")) {
    console.log("Upgrading to WebSocket for stats!");
    req.setTimeout(1000); //Close websockets after 1 second of inactivity (anti-phantoms)
    statsRelay.handleUpgrade(req, socket, head, (signalTransport) => {
      statsRelay.emit("connection", signalTransport, req);
    });
  } else {
    socket.destroy();
  }
};

module.exports = wsServer;
