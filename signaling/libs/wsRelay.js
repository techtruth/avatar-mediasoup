/**
 * Signaling Relay between client and server
 *  - Passes data between the express webapp and mediaworker process
 *  - Is essentally a websocket with a few logic bits added
 *  - This can be replaced by whatever signaling is needed
 * @TODO clean this class up
 * @file Websocket Signaling Relay - Accepts and exchanges signaling messages for WebRTC clients.
 * @namespace signalrelay
 */

const uuid = require("uuid4");
const { parse } = require("url");
const websocket = require("ws");

// Create websocket endpoint

const clients = new Map();

module.exports = function () {
  console.debug("Constructed signal relay module.");
  const relayServer = new websocket.Server({
    noServer: true,
    clientTracking: false,
    maxPayload: 8192,
  });

  relayServer.on("connection", function connection(relay, req) {
    relay.ip = req.socket.remoteAddress;
    console.log("Inbound signaling relay request from", relay.ip);
    // catch errors
    relay.on("error", console.error);
    // During a reconnect, a UUID is reused
    const { query } = parse(req.url, true);
    if (query.uuid && uuid.valid(query.uuid)) {
      console.log(`Client ${query.uuid} is reconnecting.`);
      relay.id = query.uuid;
    } else {
      relay.id = uuid();
    }
    clients.set(relay.id, relay);

    relay.isAlive = true;

    //let pingpong;

    //function ping() {
    //  // console.log("Pinging", relay.id);
    //  try {
    //    if (relay.isAlive === false) {
    //      process.send({
    //        ws: relay.id,
    //        message: {
    //          type: "disconnectPeerWebsocket",
    //          message: { code: "pingpongtimeout", transport: relay.id },
    //        },
    //      });
    //      clients.delete(relay.id);
    //      console.log(
    //        `Signaling transport closed to ${relay.ip} with code pingpongtimeout`
    //      );
    //
    //      relay.terminate();
    //      clearTimeout(pingpong);
    //      return;
    //    }
    //    relay.isAlive = false;
    //  } catch (err) {
    //    console.error(`Ping failed ${err}`);
    //  } finally {
    //    relay.ping();
    //  }
    //
    //  pingpong = setTimeout(ping, 30000);
    //}
    //ping();

    //relay.on("pong", function () {
    //  // console.log("Getting pong from", relay.ip);
    //  this.isAlive = true;
    //});

    //Send JSON to coordinator process via IPC
    // (hint: it ends up going to the mediaworker)
    relay.on("message", async function incoming(message) {
      process.send({ ws: relay.id, message: JSON.parse(message) });
    });

    relay.on("close", function close(code, reason) {
      console.log(
        `Signaling transport closed to ${
          relay.ip
        } with code ${code} ${reason.toString()}`
      );

      process.send({
        ws: relay.id,
        message: {
          type: "disconnectPeerWebsocket",
          message: { code, transport: relay.id },
        },
      });
      clients.delete(relay.id);
      //clearTimeout(pingpong);
    });
  });

  //Send incoming IPC messages back down the websockets (as reply)
  relayServer.on("ipcback", function senditback(ipcmessage) {
    //Ensure client is still connected/active, then send
    clients.get(ipcmessage.ws).send(JSON.stringify(ipcmessage.communication));
  });

  return relayServer;
};
