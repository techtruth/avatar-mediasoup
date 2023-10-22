import { RtpCapabilities } from "mediasoup-client/lib/RtpParameters";
import {
  ConnectEgressTransport,
  ConnectIngressTransport,
  Guid,
  ResponseMessage,
} from "./peerTypes";
/* eslint-disable @typescript-eslint/no-var-requires */
/**signal
 * Signaling Relay between client and server
 *  - Passes data between the express webapp and mediaworker process
 *  - Is essentally a websocket with a few logic bits added
 *  - This can be replaced by whatever signaling is needed
 * @file NetSocket Signaling Relay between media and clients
 */

import {
  CreateDataProducer,
  CreateMediaProducer,
  CreateWebrtcEgress,
  Server,
  ServerLoads,
  MediaServerPipes,
  Regions,
  RoutingTable,
  RoutingTableItems,
  NetSocket,
  ParseMessages,
} from "./signalRouterTypes";

/*
 ** Incoming message structure
 ** ws - id of the media server transport
 ** message
 **    - type - Message action
 **    - data - Message parameters/arguments
 */

// Manages network connections between media servers and api
//  can send message from api to ingress
//  can send message from api to egress
//  can accept message from ingress and send to egress
//  can accept message from egress and send to ingress
//  can accept message from ingress and send to client
//  can accept message from egress and send to client
//

/*
 ** Accept inbound connections from live mediaservers and 'register them'
 **
 ** Forward signals between mediaservers to establish network transport interconnect between servers
 **
 **
 */

const { default: axios } = require("axios");
const net = require("net");
const statsUrl = "https://api.statuspage.io/v1/pages";
module.exports = class signalRouter {
  netBuf: any;
  ingress: Server;
  egress: Server;
  movement: Server;
  ingressRegions: Regions;
  egressRegions: Regions;
  movementRegions: Regions;
  ingressLoad: ServerLoads;
  egressLoad: ServerLoads;
  movementLoad: ServerLoads;
  routingTable: RoutingTable;
  pipes: MediaServerPipes;
  getConsumerMessages: any;
  dropServer: any;
  mediaSignaling: any;
  /**
   * Delivers signaling messages between the media servers and the peerConnectionManager.
   * Encapsulates the actual NetSocket transports
   * Also translates client-regions to server-regions (cloudfront regions to aws regions)
   */
  constructor(newConsumers_cb: any, dropServer_cb: any) {
    console.debug("Constructed signal router module.");
    this.netBuf = require("net-buffer");
    this.netBuf.setMaxMessageLength(4); //Set message length for signaling

    this.ingress = {};
    this.egress = {};
    this.movement = {};
    this.ingressRegions = {};
    this.egressRegions = {};
    this.movementRegions = {};
    this.ingressLoad = {};
    this.egressLoad = {};
    this.movementLoad = {};

    //Which ingress and egress servers that represent a room
    // As defined by peer connection manager.
    this.routingTable = {};

    //Which ingress server pipes data to what egress server
    this.pipes = [];

    this.getConsumerMessages = newConsumers_cb;
    this.dropServer = dropServer_cb;

    //Start signaling servers for ingress server signaling
    this.mediaSignaling = net.createServer((connection: NetSocket) => {
      console.log("New media server connected from", connection.remoteAddress);

      connection.on("error", (err) => {
        console.log(
          "Error in connection to media server",
          connection.remoteAddress,
          err
        );
        connection.destroy(err);
      });

      connection.on("close", () => {
        console.log("Server connection closed!");

        //Get the ingress or egress server of this connection
        //TODO: condense this into a single variable selectedServer
        const ingressServer = Object.keys(this.ingress).filter((key) => {
          return this.ingress[key] == connection;
        })[0];
        const egressServer = Object.keys(this.egress).filter((key) => {
          return this.egress[key] == connection;
        })[0];
        const movementServer = Object.keys(this.movement).filter((key) => {
          return this.movement[key] == connection;
        })[0];

        if (egressServer) {
          console.log("Cleaning egress server entry", egressServer);
          //Instruct calling connection manager to clear this route
          dropServer_cb(egressServer);
          delete this.egress[egressServer];
          const region = this.resolveServerToRegion(egressServer);
          //Remove load entry for this server
          if (region) {
            delete this.egressLoad[region][egressServer];
            this.egressRegions[region] = this.egressRegions[region].filter(
              (egress) => egress !== egressServer
            );
          }
          // this.serverDownReport(ingressServer, region);
        }
        if (ingressServer) {
          console.log("Cleaning ingress server entry", ingressServer);
          //Instruct calling connection manager to clear this route
          dropServer_cb(ingressServer);
          delete this.ingress[ingressServer];
          //Remove load entry for this server
          if (this.resolveServerToRegion(ingressServer)) {
            const resolveRegion = this.resolveServerToRegion(ingressServer);
            if (resolveRegion) {
              delete this.ingressLoad[resolveRegion][ingressServer];
            }
          }
          const region = this.resolveServerToRegion(ingressServer);
          //Remove load entry for this server
          if (region) {
            delete this.ingressLoad[region][ingressServer];
            this.ingressRegions[region] = this.ingressRegions[region].filter(
              (ingress) => ingress !== ingressServer
            );
          }
          // send to status page for server down
          // this.serverDownReport(ingressServer, region);
        }

        if (movementServer) {
          console.log("Cleaning movement server entry", movementServer);
          //Instruct calling connection manager to clear this route
          dropServer_cb(movementServer);
          delete this.movement[movementServer];
          //Remove load entry for this server
          if (this.resolveServerToRegion(movementServer)) {
            const resolveRegion = this.resolveServerToRegion(movementServer);
            if (resolveRegion) {
              delete this.movementLoad[resolveRegion][movementServer];
            }
          }
          const region = this.resolveServerToRegion(movementServer);
          //Remove load entry for this server
          if (region) {
            delete this.movementLoad[region][movementServer];
            this.movementRegions[region] = this.movementRegions[region].filter(
              (movement) => movement !== movementServer
            );
          }
          // this.serverDownReport(ingressServer, region);
        }

        //Delete this servers pipe entry
        this.pipes = this.pipes.filter(
          (pipe) =>
            pipe.egress !== egressServer && pipe.ingress !== ingressServer
        );

        //Delete entry from routing table
        for (const room in this.routingTable) {
          if (
            this.routingTable[room].egress.includes(egressServer) ||
            this.routingTable[room].ingress.includes(ingressServer) ||
            this.routingTable[room].movement.includes(movementServer)
          ) {
            delete this.routingTable[room];
          }
        }
        console.log("Media server cleaned from memory.");
      });

      connection.on("end", () => {
        console.log(
          "Ended signal transport from api server to media or movement server"
        );
      });
      const buffDecode = this.netBuf.decode(
        connection,
        (message: { toString: () => string }) => {
          let parsedMessage: ParseMessages;
          try {
            parsedMessage = JSON.parse(message.toString());
            if (!parsedMessage.message && !parsedMessage.communication) {
              throw new Error("Missing communication or Message");
            }
          } catch (err: any) {
            console.error(
              `Signal router got invalid message. Message: ${message}, Error: ${err.message}, Source: ${connection.remoteAddress}`
            );
            return;
          }
          // If parsed message has message, forward to media servers
          //  else, (it has a communication) send it back to webclient
          if (parsedMessage.message) {
            if (parsedMessage.message.type === "serverLoad") {
              console.log(
                "Signal from media server:",
                parsedMessage.message.type
              );
            } else {
              console.log(
                "Signal from media server:",
                parsedMessage.message.type,
                parsedMessage.message
              );
            }
            if (parsedMessage.message.type === "registerMovementServer") {
              console.log("register movement server: ", parsedMessage.node);
              //Register new movement server
              this.movement[parsedMessage.node] = connection;
              if (!this.movementRegions[parsedMessage.message.region]) {
                this.movementRegions[parsedMessage.message.region] = [];
              }
              this.movementRegions[parsedMessage.message.region].push(
                parsedMessage.node
              );
            } else if (parsedMessage.message.type === "createdMovementServer") {
              console.log(
                "created movement server: ",
                parsedMessage.message.domain
              );
            } else if (parsedMessage.message.type === "registerMediaServer") {
              //Register new media server
              if (parsedMessage.message.mode === "ingress") {
                this.ingress[parsedMessage.node] = connection;
                if (!this.ingressRegions[parsedMessage.message.region]) {
                  this.ingressRegions[parsedMessage.message.region] = [];
                }
                this.ingressRegions[parsedMessage.message.region].push(
                  parsedMessage.node
                );
              } else if (parsedMessage.message.mode === "egress") {
                this.egress[parsedMessage.node] = connection;
                if (!this.egressRegions[parsedMessage.message.region]) {
                  this.egressRegions[parsedMessage.message.region] = [];
                }
                this.egressRegions[parsedMessage.message.region].push(
                  parsedMessage.node
                );
              } else {
                console.error("Unknown mode in registring new media server!");
              }

              //Forward message to egress server, as selected by route pipes
              // Ingress to here to Egress
              // Send to egress the listening port on ingress to the associated egress
              // This association is first known by comparing ingress address and peerId
              // And also setting the ingressRoute of the pipe
              // And send message UNALTERED to associated egress known by pipe
              // (This is only needed once per connection betweeen an ingress router
              //       and an egress router. Many media producers/consumers can use a pipe)
            } else if (parsedMessage.message.type === "storePipeRelay") {
              //Record the ingressRoute for this pipe
              this.pipes.push({
                ingress: parsedMessage.node,
                egress: parsedMessage.message.data.egress,
                ingressRoute: parsedMessage.message.data.ingressRoute,
                egressRoute: undefined,
              });

              //Send ingress's pipe information to the associated egress server
              const signalBuffer = Buffer.from(JSON.stringify(parsedMessage));
              this.sendEgress(parsedMessage.message.data.egress, signalBuffer);

              //Forward message to ingress server, as selected by route pipes
              // Egress to here to Ingress
              // Send to the associated ingress the listening port on egress
              // This completes the pipe-interconnect process ending with one pipe
              // endpoint on the ingress and egress in the connected state.
              // Media/Data may now be run over this pipe, as it is between one
              // router on ingress and one router on egress.
              // ( Is received after create relay producer. The connectPipeRelay is
              //      sent as a result of creating a relay producer. )
            } else if (parsedMessage.message.type === "connectPipeRelay") {
              //Find route pair, in order to know what ingress to send this reply to.
              const pipeIndex = this.pipes.findIndex((pipe) => {
                if (parsedMessage.message?.type === "connectPipeRelay") {
                  return (
                    pipe.egress === parsedMessage.node &&
                    pipe.ingressRoute ===
                      parsedMessage.message.data.ingressRoute
                  );
                }
              });

              //Record the egressRoute for this route pair (technically only for logging)
              //HACK: dont try to set egress route if values are not set
              //TODO: find out why this is not set correctly.
              if (
                this.pipes &&
                typeof pipeIndex !== "undefined" &&
                this.pipes[pipeIndex]
              ) {
                this.pipes[pipeIndex].egressRoute =
                  parsedMessage.message.data.egressRoute;
              } else {
                console.error("PIPE NOT FOUND!!");
                return;
              }

              //Send egress's reply with pipe information to the associated ingress server
              const signalBuffer = Buffer.from(JSON.stringify(parsedMessage));
              this.sendIngress(this.pipes[pipeIndex].ingress, signalBuffer);

              //Forward message from ingress to associated egress server
              // When ingress receives new media/data,
              // it sends this message to egress so that egress may receive the media/data
              // from ingress.
            } else if (parsedMessage.message.type === "createRelayProducer") {
              //Find route pair, in order to know what egress to send this reply to.
              const signalBuffer = Buffer.from(JSON.stringify(parsedMessage));
              this.sendEgress(parsedMessage.message.data.egress, signalBuffer);

              //Create a message and send back to the egress this came from.
              // Now that egress has created the relay producer (and has the data in its routers)
              // make a new media/data announcement for each peer in the room to receive it
              // Consult the peer manager for what messages should be sent to this egress
              // TODO: This sends one message from api to egress per new consumer
              // TODO: optimize this to send one message from api to egress,
              // TODO: yet containing all the consumers to create,
            } else if (parsedMessage.message.type === "createdRelayProducer") {
              const requestMessages = this.getConsumerMessages(
                parsedMessage.message.data.peerId,
                parsedMessage.message.data.kind,
                parsedMessage.message.data.label
              );

              //Send all messages to egress server
              if (requestMessages) {
                for (const _message of requestMessages) {
                  const createConsumerString = Buffer.from(
                    JSON.stringify(_message)
                  );
                  this.sendEgress(parsedMessage.node, createConsumerString);
                }
              }

              // Store server load when we get announcement from any media server
              // This helps determine load when distributing users across server pool
            } else if (parsedMessage.message.type === "serverLoad") {
              //Store server load for later reference
              if (parsedMessage.message.mode === "movement") {
                if (!this.movementLoad[parsedMessage.message.region]) {
                  this.movementLoad[parsedMessage.message.region] = {};
                }

                this.movementLoad[parsedMessage.message.region][
                  parsedMessage.node
                ] = parsedMessage.message.load;
              } else if (parsedMessage.message.mode === "ingress") {
                if (!this.ingressLoad[parsedMessage.message.region]) {
                  this.ingressLoad[parsedMessage.message.region] = {};
                }

                this.ingressLoad[parsedMessage.message.region][
                  parsedMessage.node
                ] = parsedMessage.message.load;
              } else if (parsedMessage.message.mode === "egress") {
                if (!this.egressLoad[parsedMessage.message.region]) {
                  this.egressLoad[parsedMessage.message.region] = {};
                }
                this.egressLoad[parsedMessage.message.region][
                  parsedMessage.node
                ] = parsedMessage.message.load;
              } else {
                console.error(
                  "Server load gotten with unknown mode!",
                  parsedMessage
                );
              }
            }
          } else {
            //Forward all other messages to client endpoint
            //-consumeAudioAnnouncement
            //-consumeVideoAnnouncement
            //-consumeMovementAnnouncement
            //-peerLagScore
            if (process.send && parsedMessage.communication) {
              console.log(
                "Signal from media server to WS Client:",
                parsedMessage.communication.type,
                parsedMessage.communication
              );
              process.send(parsedMessage); //Send back to websocket client
            }
          }
        },
        true
      );
      //Read commands from signaling pipe
      connection.on("readable", () => {
        try {
          buffDecode();
        } catch (e) {
          console.error("Error decoding message (and closing connection):", e);
          connection.destroy("Error decoding message" as unknown as Error);
        }
      });
    });
  }

  /**
   * Instructs the media server to join a peer to the selected room.
   * @param room - Room to join
   * @param wsTransportId - Joining peer's wsid (so a reply can be sent)
   * @param serverType - Which type of server to join (ingress|egress)
   * @param serverId - UUID of the server to send the signal to
   */
  requestJoin(
    room: string,
    wsTransportId: Guid,
    serverType: string,
    serverId: Guid
  ) {
    console.log("@@@ server type: ", serverType);
    //Construct signal message to send ingress/egress servers
    const joinRoomSignal = {
      wsid: wsTransportId,
      message: { type: "createRouterGroup", data: { room: room } },
    };
    const joinRoomString = Buffer.from(JSON.stringify(joinRoomSignal));

    // Send the join request to ingress
    if (serverType === "ingress") {
      //Write message to server
      this.sendIngress(serverId, joinRoomString);

      // Send the join request to egress
    } else if (serverType === "egress") {
      this.sendEgress(serverId, joinRoomString);
    } else if (serverType === "movement") {
      this.sendMovement(serverId, joinRoomString);

      // Catch errors in server type
    } else {
      console.error("This is not a valid server type:", serverType);
    }
  }

  /**
   * Send message to ingress, requesting transport
   *  replies with the createdIngressTransport
   * @param requestMessage - Message to send to media server
   * @param serverId - ID of the serer to send to.
   */
  requestIngressTransport(requestMessage: any, serverId: Guid) {
    const signalString = Buffer.from(JSON.stringify(requestMessage));
    this.sendIngress(serverId, signalString);
  }

  /**
   * Send message to egress, requesting transport
   *  replies with the createdEgressTransport
   * @param requestMessage - Message to send to media server
   * @param serverId - ID of the serer to send to.
   */
  requestEgressTransport(requestMessage: CreateWebrtcEgress, serverId: Guid) {
    const signalString = Buffer.from(JSON.stringify(requestMessage));
    this.sendEgress(serverId, signalString);
  }

  /**
   * Send message to ingress, connecting transport
   *  previously requested.
   * Replies with connected transport
   * @param connectMessage - Message to send to media server
   * @param serverId - ID of the serer to send to.
   */
  connectIngressTransport(
    connectMessage: ConnectIngressTransport,
    serverId: Guid
  ) {
    const signalString = Buffer.from(JSON.stringify(connectMessage));
    this.sendIngress(serverId, signalString);
  }

  /**
   * Send message to egress, connecting transport
   *  previously requested.
   * Replies with connected transport
   * @param connectMessage - Message to send to media server
   * @param serverId - ID of the serer to send to.
   */
  connectEgressTransport(
    connectMessage: ConnectEgressTransport,
    serverId: Guid
  ) {
    const signalString = Buffer.from(JSON.stringify(connectMessage));
    this.sendEgress(serverId, signalString);
  }

  /**
   * Send a signal to the media server
   *  to create an Audio producer
   * @param createMessage - Message to send to media server
   * @param serverId - ID of the serer to send to.
   */
  createAudioProducer(createMessage: CreateMediaProducer, serverId: Guid) {
    const signalString = Buffer.from(JSON.stringify(createMessage));
    this.sendIngress(serverId, signalString);
  }

  /**
   * Send a signal to the media server
   *  to create a Video producer
   * @param createMessage - Message to send to media server
   * @param serverId - ID of the serer to send to.
   */
  createVideoProducer(createMessage: CreateMediaProducer, serverId: Guid) {
    const signalString = Buffer.from(JSON.stringify(createMessage));
    this.sendIngress(serverId, signalString);
  }

  //Webrtc movement server
  /**
   * Send a signal to the media server
   *  to create a Movement producer
   * @param createMessage - Message to send to media server
   * @param serverId - ID of the serer to send to.
   */
  createMovementProducer(createMessage: CreateDataProducer, serverId: Guid) {
    const signalString = Buffer.from(JSON.stringify(createMessage));
    this.sendIngress(serverId, signalString);
  }

  //Create data producer
  createEventProducer(createMessage: CreateDataProducer, serverId: Guid) {
    const signalString = Buffer.from(JSON.stringify(createMessage));
    this.sendIngress(serverId, signalString);
  }

  /**
   * Send signal for one peer to consume all available Audio inside a room
   * @todo this should only send to an egress server the peers for that egress server
   * @todo there must be somethng before this that can build an object by egress servers
   * @param requestingTransport - Peer's transport ID so a reply can be sent from media server
   * @param requestingRTPCaps - Requesting peer's RTP capabilities
   * @param requestingId - not used?
   * @param producers - Array of peer ID to which a consumer must be made
   */
  requestAllAudio(
    requestingTransport: Guid,
    requestingRTPCaps: RtpCapabilities,
    requestingId: Guid,
    room: string,
    producers: Guid[]
  ) {
    const consumeAllAudioSignal = {
      wsid: requestingTransport,
      message: {
        type: "consumeAudio",
        data: {
          consumerPeer: requestingId,
          producerPeer: producers,
          room: room,
          rtpCaps: requestingRTPCaps,
        },
      },
    };
    const signalString = Buffer.from(JSON.stringify(consumeAllAudioSignal));

    //Send this message to every egress server in the group
    //TODO make this only send to serves that have the peer...
    if (!this.routingTable[room]) {
      console.error(
        "the routing table is bad for room when requesting audio",
        room,
        this.routingTable
      );
    } else {
      for (const egressId of this.routingTable[room].egress) {
        this.sendEgress(egressId, signalString);
      }
    }
  }

  /**
   * Send signal for one peer to consume all available Video inside a room
   * @todo this should only send to an egress server the peers for that egress server
   * @todo there must be somethng before this that can build an object by egress servers
   * @param requestingTransport - Peer's transport ID so a reply can be sent from media server
   * @param requestingRTPCaps - Requesting peer's RTP capabilities
   * @param requestingId - not used?
   * @param producers - Array of peer ID to which a consumer must be made
   */
  requestAllVideo(
    requestingTransport: Guid,
    requestingRTPCaps: RtpCapabilities,
    requestingId: Guid,
    room: string,
    producers: Guid[]
  ) {
    const consumeAllVideoSignal = {
      wsid: requestingTransport,
      message: {
        type: "consumeVideo",
        data: {
          consumerPeer: requestingId,
          producerPeer: producers,
          room: room,
          rtpCaps: requestingRTPCaps,
        },
      },
    };
    const signalString = Buffer.from(JSON.stringify(consumeAllVideoSignal));

    //Send this message to every egress server in the group
    //TODO make this only send to serves that have the peer...
    if (!this.routingTable[room]) {
      console.error(
        "the routing table is bad for room when requesting video",
        room,
        this.routingTable
      );
    } else {
      for (const egressId of this.routingTable[room].egress) {
        this.sendEgress(egressId, signalString);
      }
    }
  }

  //Web rtc movement
  /**
   * Send signal for one peer to consume all available movement inside a room
   * @todo this should only send to an egress server the peers for that egress server
   * @todo there must be somethng before this that can build an object by egress servers
   * @param requestingTransport - Peer's transport ID so a reply can be sent from media server
   * @param requestingRTPCaps - Requesting peer's RTP capabilities
   * @param requestingId - not used?
   * @param producers - Array of peer ID to which a consumer must be made
   */
  requestAllMovement(
    requestingTransport: Guid,
    requestingId: Guid,
    room: string,
    producers: Guid[]
  ) {
    const consumeAllMovementSignal = {
      wsid: requestingTransport,
      message: {
        type: "consumeMovement",
        data: {
          consumerPeer: requestingId,
          producerPeer: producers,
          room: room,
        },
      },
    };
    const signalString = Buffer.from(JSON.stringify(consumeAllMovementSignal));

    //Send this message to every egress server in the group
    //TODO make this only send to serves that have the peer...
    if (!this.routingTable[room]) {
      console.error(
        "the routing table is bad for room when requesting movement",
        room,
        this.routingTable
      );
    } else {
      for (const egressId of this.routingTable[room].egress) {
        this.sendEgress(egressId, signalString);
      }
    }
  }

  /**
   * Send signal for one peer to consume all available movement inside a room
   * @todo this should only send to an egress server the peers for that egress server
   * @todo there must be somethng before this that can build an object by egress servers
   * @param requestingTransport - Peer's transport ID so a reply can be sent from media server
   * @param requestingRTPCaps - Requesting peer's RTP capabilities
   * @param requestingId - not used?
   * @param producers - Array of peer ID to which a consumer must be made
   */
  requestAllEvents(
    requestingTransport: Guid,
    requestingId: Guid,
    room: string,
    producers: Guid[]
  ) {
    const consumeAllEventsSignal = {
      wsid: requestingTransport,
      message: {
        type: "consumeEvents",
        data: {
          consumerPeer: requestingId,
          producerPeer: producers,
          room: room,
        },
      },
    };
    const signalString = Buffer.from(JSON.stringify(consumeAllEventsSignal));

    //Send this message to every egress server in the group
    //TODO make this only send to serves that have the peer...
    if (!this.routingTable[room]) {
      console.error(
        "the routing table is bad for room when requesting events",
        room,
        this.routingTable
      );
    } else {
      for (const egressId of this.routingTable[room].egress) {
        this.sendEgress(egressId, signalString);
      }
    }
  }

  /**
   * Send a signal to the media server
   *  to send a mute to producer
   * @param createMessage - Message to send to media server
   * @param serverId - ID of the serer to send to.
   */
  pauseProducer(createMessage: ResponseMessage, serverId: Guid) {
    if (createMessage.message.type !== "producerPause") {
      console.log(
        "wrong type of message tyring to send: ",
        createMessage.message.type
      );
      return;
    }
    const signalString = Buffer.from(JSON.stringify(createMessage));
    this.sendIngress(serverId, signalString);
  }
  resumeProducer(createMessage: ResponseMessage, serverId: Guid) {
    if (createMessage.message.type !== "producerResume") {
      console.log(
        "wrong type of message tyring to send: ",
        createMessage.message.type
      );
      return;
    }
    const signalString = Buffer.from(JSON.stringify(createMessage));
    this.sendIngress(serverId, signalString);
  }

  /**
   * Send a signal to the media server
   *  to send a mute to producer
   * @param createMessage - Message to send to media server
   * @param serverId - ID of the serer to send to.
   */
  pauseConsumer(createMessage: ResponseMessage, serverId: Guid) {
    if (createMessage.message.type !== "consumerPause") {
      console.log(
        "wrong type of message tyring to send: ",
        createMessage.message.type
      );
      return;
    }
    const signalString = Buffer.from(JSON.stringify(createMessage));
    this.sendEgress(serverId, signalString);
  }
  resumeConsumer(createMessage: ResponseMessage, serverId: Guid) {
    if (createMessage.message.type !== "consumerResume") {
      console.log(
        "wrong type of message tyring to send: ",
        createMessage.message.type
      );
      return;
    }
    const signalString = Buffer.from(JSON.stringify(createMessage));
    this.sendEgress(serverId, signalString);
  }
  /**
   * Send a signal to the media server to close producer
   *  to send the peer has transition to another frame
   * * @param createMessage - Message to send to media server
   * @param serverId - ID of the serer to send to.
   */
  // TODO remove this when we turn our producers into an array in avatar.js
  producerClose(
    createMessage: ResponseMessage,
    ingressServerId: Guid,
    egressServerId: Guid
  ) {
    if (createMessage.message.type !== "producerClose") {
      console.log(
        "wrong type of message tyring to send: ",
        createMessage.message.type
      );
      return;
    }
    const signalString = Buffer.from(JSON.stringify(createMessage));
    this.sendEgress(egressServerId, signalString);
    this.sendIngress(ingressServerId, signalString);
  }

  // Send a request to the media server to restart ICE
  // and send new iceParameters back via WS 'restartedIce'
  restartIce(
    wsid: Guid,
    message: any,
    ingressServerId: Guid,
    egressServerId: Guid
  ) {
    message.wsid = wsid;
    const signalString = Buffer.from(JSON.stringify(message));
    if (egressServerId) {
      this.sendEgress(egressServerId, signalString);
    } else if (ingressServerId) {
      this.sendIngress(ingressServerId, signalString);
    } else {
      console.log("No egress or ingress server given for restartIce");
    }
  }

  /**
   * Send signal to close an egress transport
   * @param closeMessage - Message containing close instructions
   * @param serverId - ID of the server being sent to
   */
  closeEgressTransport(closeMessage: ResponseMessage, serverId: Guid) {
    const signalString = Buffer.from(JSON.stringify(closeMessage));
    this.sendEgress(serverId, signalString);
  }

  /**
   * Send signal to close an egress transport
   * @param closeMessage - Message containing close instructions
   * @param serverId - ID of the server being sent to
   */
  closeIngressTransport(closeMessage: ResponseMessage, serverId: Guid) {
    if (closeMessage.message.type !== "disconnectTransport") {
      console.log(
        "wrong type of message tyring to send: ",
        closeMessage.message.type
      );
      return;
    }
    const signalString = Buffer.from(JSON.stringify(closeMessage));
    this.sendIngress(serverId, signalString);
  }

  /**
   * Send signal to close a room. This is usually done
   *  when the last peer has left the room.
   * @param closeMessage - Message containing close instructions
   * @param routerNetwork - Name of the room (RouterNetwork) to close
   */
  closeRoom(closeMessage: ResponseMessage, routerNetwork: Guid) {
    if (closeMessage.message.type !== "destroyRouterGroup") {
      console.log(
        "wrong type of message tyring to send: ",
        closeMessage.message.type
      );
      return;
    }
    const signalString = Buffer.from(JSON.stringify(closeMessage));
    //Consult routing table to find all servers who house ingress/egress for this network
    if (this.routingTable[routerNetwork]) {
      this.routingTable[routerNetwork].ingress.forEach((ingressId) => {
        this.sendIngress(ingressId, signalString);
      });
    }

    if (this.routingTable[routerNetwork]) {
      this.routingTable[routerNetwork].egress.forEach((egressId) => {
        this.sendEgress(egressId, signalString);
      });
    }
    console.log("@@ before if sending destroy movement");
    if (this.routingTable[routerNetwork]) {
      console.log("@@ before sending destroy movement");
      console.log("@@ routeingTable: ", this.routingTable[routerNetwork]);
      this.routingTable[routerNetwork].movement.forEach((movementId) => {
        this.sendMovement(movementId, signalString);
      });
    }
  }

  //
  // Private (not really) funtions
  //

  /**
   * Send signal to ingress server
   * @param ingressId - ID of the ingress server to send the signal to
   * @param signalString - String of the signal
   */
  sendIngress(ingressId: Guid, signalString: Buffer) {
    //HACK: Escape loop if egress server is undefined
    //TODO: handle cleanup loop for
    if (!this.ingress[ingressId]) {
      console.error(
        "Ingress server is not able to send",
        ingressId,
        signalString
      );
      // const region = this.resolveServerToRegion(ingressId);
      // this.serverDownReport(ingressId, region);
      return;
    }
    this.ingress[ingressId].write(
      this.netBuf.encode(Buffer.from(signalString))
    );
  }

  /**
   * Send signal to egress server
   * @param ingressId - ID of the ingress server to send the signal to
   * @param signalString - String of the signal
   */
  sendEgress(egressId: Guid, signalString: Buffer) {
    //HACK: Escape loop if egress server is undefined
    //TODO: handle cleanup loop for
    if (!this.egress[egressId]) {
      console.error(
        "Egress server is not able to send",
        egressId,
        signalString.toString()
      );
      // const region = this.resolveServerToRegion(egressId);
      // this.serverDownReport(egressId, region);
      return;
    }

    this.egress[egressId].write(this.netBuf.encode(Buffer.from(signalString)));
  }

  /**
   * Send signal to movement server
   * @param movementId - ID of the movement server to send the signal to
   * @param signalString - String of the signal
   */
  sendMovement(movementId: Guid, signalString: Buffer) {
    if (!this.movement[movementId]) {
      console.error(
        "Movement server is not able to send",
        movementId,
        signalString.toString()
      );
      return;
    }
    this.movement[movementId].write(
      this.netBuf.encode(Buffer.from(signalString))
    );
  }

  //
  // Helpers
  //

  /**
   * Send signal to egress server
   * @param ingressId - ID of the ingress server to send the signal to
   * @param signalString - String of the signal
   */
  setRoute(routeName: string, routeObject: RoutingTableItems) {
    console.log("@@ set routingTable object: ", routeObject);
    this.routingTable[routeName] = routeObject;
  }

  getRoute(routeName: string) {
    if (!this.routingTable[routeName]) {
      const newRoute: RoutingTableItems = {
        ingress: [],
        egress: [],
        movement: [],
      };
      return newRoute;
    } else {
      return this.routingTable[routeName];
    }
  }

  getRouteEgress(routeName: string) {
    return this.getRoute(routeName).egress;
  }

  /**
   * Send signal to egress server
   * @param ingressId - ID of the ingress server to send the signal to
   * @param signalString - String of the signal
   */
  getIngress(region: string) {
    const serverRegion = this.resolveRegion(region);
    let selectedServer;

    //Check to see if region is valid
    if (
      serverRegion in this.ingressLoad &&
      serverRegion in this.ingressRegions
    ) {
      const [leastLoaded] = Object.entries(this.ingressLoad[serverRegion]).sort(
        ([, load1], [, load2]) => load1 - load2
      );
      selectedServer = this.ingressRegions[serverRegion].find(
        (element) => element === leastLoaded[0]
      );
    }

    if (!selectedServer) {
      return Object.values(this.ingressRegions)[0]?.[0];
    } else {
      return selectedServer;
    }
  }

  /**
   * Return an egress server within the given region
   * @param region - Cloudfront region to get server from
   */
  getEgress(region: string) {
    const serverRegion = this.resolveRegion(region);
    let selectedServer;

    //Check to see if region is valid
    if (serverRegion in this.egressLoad && serverRegion in this.egressRegions) {
      const [leastLoaded] = Object.entries(this.egressLoad[serverRegion]).sort(
        ([, load1], [, load2]) => load1 - load2
      );
      selectedServer = this.egressRegions[serverRegion].find(
        (element) => element === leastLoaded[0]
      );
    }
    if (!selectedServer) {
      const defaultServer = Object.values(this.egressRegions)[0]?.[0];
      if (!defaultServer) {
        console.error(
          "Attempted to use default egress for regions, but none exist"
        );
      } else {
        console.warn("Using default egress for regions", defaultServer);
      }
      return defaultServer;
    } else {
      return selectedServer;
    }
  }

  /**
   * Send signal to egress server
   * @param ingressId - ID of the ingress server to send the signal to
   * @param signalString - String of the signal
   */
  getMovement(region: string) {
    const serverRegion = this.resolveRegion(region);
    let selectedServer;

    //Check to see if region is valid
    if (
      serverRegion in this.movementLoad &&
      serverRegion in this.movementRegions
    ) {
      const [leastLoaded] = Object.entries(
        this.movementLoad[serverRegion]
      ).sort(([, load1], [, load2]) => load1 - load2);
      selectedServer = this.movementRegions[serverRegion].find(
        (element) => element === leastLoaded[0]
      );
    }

    if (!selectedServer) {
      return Object.values(this.movementRegions)[0]?.[0];
    } else {
      return selectedServer;
    }
  }

  /**
   * Get the region of a server
   * @param serverId - ID of the ingress server to get the region of
   */
  resolveServerToRegion(serverId: Guid): string | false {
    for (const [region, servers] of Object.entries(this.ingressRegions)) {
      const selectedIngress = servers.find((server) => server === serverId);
      if (selectedIngress) {
        return region;
      }
    }
    for (const [region /*servers*/] of Object.entries(this.egressRegions)) {
      //TODO: change this to only use value, or use servers variable
      const selectedEgress = this.egressRegions[region].find(
        (server) => server === serverId
      );
      if (selectedEgress) {
        return region;
      }
    }
    for (const [region /*servers*/] of Object.entries(this.movementRegions)) {
      //TODO: change this to only use value, or use servers variable
      const selectedEgress = this.movementRegions[region].find(
        (server) => server === serverId
      );
      if (selectedEgress) {
        return region;
      }
    }

    return false;
  }

  /**
   * report server down the statuspage
   * @param serverId - Server UUID
   * @param region - AWS region
   **/

  serverDownReport(serverId: Guid, region: string) {
    // send error to stats api
    if (process.env.NODE_ENV !== "production") {
      console.log("devement no need to sent server down status");
      return;
    }
    const errorMessage = {
      incident: {
        name: "mediaserver incident",
        status: "identified",
        impact_override: "none",
        scheduled_remind_prior: true,
        body: `server region ${region} has experience issues, the media server id: ${serverId} is down at the moment, we are working hard to get this back soon as we can, sorry for any inconvenice`,
        components: {
          "25w86xghp98w": "major_outage",
        },
        component_ids: ["25w86xghp98w"],
      },
    };
    axios
      .post(`${statsUrl}/17423mhdjckn/incidents`, errorMessage, {
        headers: {
          "Content-Type": "application/json",
          Authorization: "OAuth 412fbdbb-c78f-4cb3-86a1-ed4b2f6f8150",
        },
      })
      .then((resp: any) => {
        console.log("response: ", resp.data[0]);
      });
  }

  //This is honestly pretty bad.
  //TODO: somehow automate this to update...

  /**
   * Get the AWS server region name,
   *  given the AWS Cloudfront region from client
   * @param region - AWS Cloudfront region (from client page headers)
   */
  resolveRegion(region: string) {
    switch (region.substring(0, 3)) {
      //Distribute to us-east-1 (Virgina)
      case "EWR": //Newark New Jersey
      case "JFK": //New York New York
      case "PHL": //Philadelphia Pennsylvania
      case "BOS": //Boston Massachusetts
      case "IAD": //Ashburn Virgina
      case "ATL": //Atlanta Georgia
      case "MIA": //Miami Florida
      case "JAX": //Jacksonville Florida
      case "ORD": //Chicago Illinois
      case "DFW": //Dallas Texas
      case "IAH": //Houston Texas
      case "MSP": //Minneapolis Minnesota
      case "SLC": //Salt Lake City Utah
      case "DEN": //Denver Colorado
      case "PHX": //Phoenix Arizona
      case "LAX": //Los Angeles California
      case "SEA": //Seattle Washington
      case "HIO": //Hillsboro Oregon
      case "SFO": //San Francisco California
      case "YUL": //Quebec Canada
      case "YTO": //Toronto Canada
      case "YVR": //Vancouver Canada
      case "MCI": //Kansas City International Airport
      case "QRO": //Meixico City
      case "IND": //Indianapolis Indiana
        return "us-east-1";

      //Distribute to sa-east-1 (São Paulo)
      case "EZE": //Buenos Aires Argentina
      case "FOR": //Fortaleza Brazil
      case "GIG": //Rio de Janeiro Brazil
      case "GRU": //São Paulo Brazil
      case "SCL": //Santiago Chile
      case "BOG": //Bogotá Colombia
        //Check if server is registered
        if (!this.egressRegions["sa-east-1"]) {
          return "us-east-1";
        }
        return "sa-east-1";

      //Distribute to ap-south-1 (Mumbai)
      case "BLR": //Bangalore India
      case "MAA": //Chennai India
      case "HYD": //Hyderabad India
      case "CCU": //Kolkata India
      case "DEL": //Delhi India
      case "BOM": //Mumbai India
      case "DXB": //Dubai United Arab Emirates
      case "FJR": //Fujairah United Arab Emirates
      case "BAH": //Muharraq Bahrain
      case "NBO": //Nairobi Kenya
      case "CPT": //Cape Town South Africa
      case "JNB": //Gauteng South Africa
      case "MCT": //Muscat Oman
        //Check if server is registered
        if (!this.egressRegions["ap-south-1"]) {
          return "us-east-1";
        }
        return "ap-south-1";

      //Distribute to eu-central-1 (Frankfurt)
      case "ATH": //Athens Greece
      case "TXL": //Berlin
      case "BRU": //Brussles
      case "OTP": //Bucharest Romania
      case "BUD": //Budapest Hungary
      case "CPH": //Copenhagen Denmark
      case "DUB": //Dublin Ireland
      case "DUS": //Dusseldorf Germany
      case "FRA": //Frankfurt Germany
      case "HAM": //Hamburg Germany
      case "MUC": //Munich Germany
      case "WAW": //Warsaw Poland
      case "HEL": //Helsinki Finland
      case "LIS": //Lisbon Portugal
      case "LHR": //London United Kingdom
      case "MAN": //Manchester United Kingdon
      case "MAD": //Madrid Spain
      case "MRS": //Marseille France
      case "MXP": //Milan Italy
      case "OSL": //Oslo Norway
      case "PMO": //Palermo Italy
      case "FCO": //Rome Italy
      case "CDG": //Paris France
      case "PRG": //Prauge Czech Republic
      case "SOF": //Sofia Bulgaria
      case "ARN": //Stockholm Sweden
      case "TLV": //Tel Aviv Israel
      case "VIE": //Vienna Austria
      case "ZAG": //Zagreb Croatia
      case "ZRH": //Zurich Switzerland
      case "AMS": //Amsterdam Netherlands
        //Check if server is registered
        if (!this.egressRegions["eu-central-1"]) {
          return "us-east-1";
        }
        return "eu-central-1";

      //Distribute to ap-northeast-1 (Tokyo)
      case "KIX": //Osaka Japan
      case "NRT": //Tokyo Japan
      case "ICN": //Seoul Korea
        //Check if server is registered
        if (!this.egressRegions["ap-northeast-1"]) {
          return "us-east-1";
        }
        return "ap-northeast-1";

      //Distribute to ap-east-1 (HongKong)
      case "BJS": //Beijing China
      case "HKG": //Hong Kong China
      case "SHA": //Shanghai China
      case "SZX": //Guangdong Hong Kong
      case "TPE": //Taiwan
      case "ZHY": //Zhongwei China
        //Check if server is registered
        if (!this.egressRegions["ap-east-1"]) {
          return "us-east-1";
        }
        return "ap-east-1";

      //Distribute to ap-southeast-1 (Singapore)
      case "CGK": //Jakarta Indonesia
      case "KUL": //Kuala Lumpur Malaysia
      case "MNL": //Manila Philippines
      case "SIN": //Singapore
      case "BKK": //Bangkok Thailand
        //Check if server is registered
        if (!this.egressRegions["ap-southeast-1"]) {
          return "us-east-1";
        }
        return "ap-southeast-1";

      //Distribute to ap-southeast-2 (Sydney)
      case "SYD": //Sydney Australia
      case "MEL": //Melbourne Australia
      case "PER": //Perth Australia
      case "AKL": //Auckland New Zeland
        //Check if server is registered
        if (!this.egressRegions["ap-southeast-2"]) {
          return "us-east-1";
        }
        return "ap-southeast-2";

      default:
        if (!this.egressRegions["us-east-1"]) {
          return "local"; //Default to local servers;
        }
        return "us-east-1"; //If us-east-1, use it
    }
  }

  listen(port: number, host: string) {
    this.mediaSignaling.listen(
      {
        port: port,
        host: host,
      },
      () => {
        console.log("API Signaling Router is online, listening");
      }
    );
  }
};
