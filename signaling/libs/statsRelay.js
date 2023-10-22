/**
 * Analytics Relay between client and server
 * @TODO clean this class up
 * @file Websocket Analytics Relay - Accepts and distributes analytics messages
 */

const websocket = require("ws");
const uuid = require("uuid4");

// Create websocket endpoint
module.exports = function () {
  console.debug("Constructed analytics relay module.");
  const relayServer = new websocket.Server({ noServer: true });

  relayServer.on("connection", function connection(relay, req) {
    console.log(
      "Inbound analytics relay request from",
      req.socket.remoteAddress
    );
    //Begin subscription to stats
    if (this.clients.size === 1) {
      process.send({
        ws: relay.id,
        message: { type: "beginSendingStats", message: {} },
      });
    }

    relay.id = uuid();
    relay.isAlive = true;
    relay.on("pong", function () {
      this.isAlive = true;
    });

    relay.on("close", (code, reason) => {
      console.log(
        "Analytics transport closed to",
        req.socket.remoteAddress,
        "with code",
        code,
        reason
      );

      //Last one out closes the door
      if (this.clients.size === 0) {
        console.log("Stopping stats signals");
        process.send({
          ws: relay.id,
          message: { type: "endSendingStats", message: {} },
        });
      }
    });
  });

  //Send incoming IPC messages back down the websockets (as reply)
  relayServer.on("sendStats", function senditback(ipcmessage) {
    //Ensure client is still connected/active, then send
    this.clients.forEach((client) => {
      client.send(JSON.stringify(ipcmessage));
    });
  });

  //Ping/Pong clients for connection stability monitoring
  let pingpong;

  function ping() {
    relayServer.clients.forEach(function each(relay) {
      if (relay.isAlive) {
        relay.isAlive = false;
        relay.ping();
        return;
      }

      process.send({
        ws: relay.id,
        message: {
          type: "disconnectPeerWebsocket",
          message: { code: "pingpongtimeout", transport: relay.id },
        },
      });
      console.log(
        "Signaling transport closed to",
        relay.remoteAddress,
        "with code pingpongtimeout"
      );

      relay.terminate();
    });

    pingpong = setTimeout(ping, 5000);
  }

  ping();

  relayServer.on("close", function close() {
    clearTimeout(pingpong);
  });

  return relayServer;
};
