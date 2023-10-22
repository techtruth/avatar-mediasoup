/**
 *  Room/Frame logic and Avatar protocol logic
 *  - Maintains list of connected peers
 *  - Handles signaling commands from client websockets
 *  - Determines which peers need what consumers/producers
 * @file connection manager logic for connecting peers with audio, video, data, and more.
 */
import { RtpCapabilities } from "mediasoup-client/lib/RtpParameters";
import {
  Guid,
  Peers,
  Peer,
  ProducerMediaOpts,
  DataProducerOpts,
  Rooms,
  Room,
  NewConsumerSignal,
  PeerCounter,
  RestartIce,
  PeerCounters,
  RequestMessage,
  ResponseMessage,
  MessageResponse,
} from "./peerTypes";
import { DtlsParameters } from "mediasoup-client/lib/Transport";
import { NumSctpStreams } from "mediasoup-client/lib/types";

const uuid = require("uuid4");
const SignalRouter = require("./signalRouter");
const { resetDefaultSlide, updateLastVisited } = require("./frameSettings");
const peers: Peers = new Map<Guid, Peer>();
const rooms: Rooms = new Map<string, Room>(); // Associates rooms to egress servers
const peerConnectionManager = class {
  peerCount: PeerCounters; //Associae peer count
  signalRouter: any;
  /**
   * Coordinate signaling messages between clients and media servers.
   * One use is to send instructions to the media servers based on client signals
   * Another use is to send signaling between peers, such as peer indicators
   * This also recieves the replies from the media servers that were given instructions,
   *  and sends the reply to the correct peer(s)
   */
  constructor() {
    console.debug("Constructed peer connection manager.");
    console.log(
      "Media signaling listening on",
      (process.env.npm_config_mediasignaling ||
        process.env.npm_package_config_mediasignaling) +
        ":" +
        (process.env.npm_config_apiserver ||
          process.env.npm_package_config_apiserver)
    );

    this.signalRouter = new SignalRouter(
      this.createConsumerMessages,
      this.dropRoute.bind(this)
    );
    this.peerCount = new Map();
    this.signalRouter.listen(
      process.env.npm_config_mediasignaling ||
        process.env.npm_package_config_mediasignaling,
      process.env.npm_config_apiserver ||
        process.env.npm_package_config_apiserver
    );
  }

  /**
   * Send a signal to a connected peer
   * This is mainly useful to announce new producers to peers
   * but has other uses as well
   * @param wsid - Receiving peer's signalTransport (websocket id)
   * @param reply - Signal with arguments to send
   */
  sendSignal(wsid: Guid, reply: any) {
    if (process.send) {
      process.send({ ws: wsid, communication: reply });
    }
  }

  /**
   * Process an incoming signal, and invoke the correct method to handle,
   * based on signal type
   * @param origin Originating websocket client connection ID
   * @param command Formatted command for the peerConnectionManager
   * @return {Object} JSON response of command invoked
   */
  async command(ipcmessage: any) {
    try {
      // Process incoming commands, and send reply
      // Remove parsing todo
      console.debug("Peer Connection Manager received command:", ipcmessage);
      const signal: RequestMessage = ipcmessage.message;

      switch (signal.type) {
        case "requestIdentity": {
          //Create new peer
          this.createPeer(ipcmessage.ws, signal.message.region);
          break;
        }

        case "joinRoom": {
          this.joinRoom(signal.message.peerId, signal.message.room);
          break;
        }

        case "getRoomMetrics": {
          /*
           * getRoomMetrics command
           * returns peerCounts for the specified rooms, or all rooms.
           *
           * @param {string} peerId - required
           * @param {string[]} rooms - optional. array of rooms. if undefined, returns peer counts for all
           */
          this.getPeerCount(signal.message.peerId, signal.message.rooms);
          break;
        }

        case "leaveRoom": {
          //Remove this peer to the requested room
          await this.leaveRoom(signal.message.peerId, signal.message.room);
          break;
        }

        case "createIngressTransport": {
          this.createIngressTransport(
            signal.message.peerId,
            signal.message.numStreams,
            signal.message.rtpCapabilities
          );

          break;
        }

        case "createEgressTransport": {
          this.createEgressTransport(
            signal.message.peerId,
            signal.message.numStreams,
            signal.message.rtpCapabilities,
            signal.message.egress
          );
          break;
        }

        case "connectIngressTransport": {
          this.connectPeerTransport(
            signal.message.peerId,
            signal.message.direction,
            signal.message.dtlsParameters
          );
          break;
        }

        case "connectEgressTransport": {
          this.connectPeerTransport(
            signal.message.peerId,
            signal.message.direction,
            signal.message.dtlsParameters,
            signal.message.egress
          );
          break;
        }

        case "produceMedia": {
          if (signal.message.producerOptions.kind === "audio") {
            this.createAudioProducer(
              signal.message.producingPeer,
              signal.message.producerOptions
            );
          }
          if (signal.message.producerOptions.kind === "video") {
            this.createVideoProducer(
              signal.message.producingPeer,
              signal.message.producerOptions
            );
          }
          break;
        }

        case "produceData": {
          this.createDataProducer(
            signal.message.producingPeer,
            signal.message.producerOptions
          );
          break;
        }
        case "produceEvents": {
          this.createEventProducer(
            signal.message.producingPeer,
            signal.message.producerOptions
          );
          break;
        }
        // -----------------------------------------------------------------------------------------------
        case "getRoomAudio": {
          this.consumeAllAudio(signal.message.requestingPeer);
          break;
        }

        case "getRoomVideo": {
          this.consumeAllVideo(signal.message.requestingPeer);
          break;
        }

        case "getRoomMovement": {
          if (!signal.message.requestingPeer) {
            console.error("getRoomMovement: ", signal.message.requestingPeer);
            break;
          }
          this.consumeAllMovement(
            signal.message.requestingPeer,
            signal.message.isSpectator
          );
          break;
        }

        case "getRoomEvents": {
          this.consumeAllEvents(signal.message.requestingPeer);
          break;
        }

        case "muteProducer": {
          this.muteProducer(
            signal.message.peerId,
            signal.message.producerId,
            signal.message.kind
          );
          break;
        }

        case "resumeProducer": {
          this.resumeProducer(
            signal.message.peerId,
            signal.message.producerId,
            signal.message.kind
          );
          break;
        }

        // -----------------------------------------------------------------------------------------------
        // Pause/Unpause producers
        case "setAudioState": {
          await this.setProducerState(
            signal.message.peerId,
            signal.message.state,
            "audio"
          );
          break;
        }

        case "setVideoState": {
          await this.setProducerState(
            signal.message.peerId,
            signal.message.state,
            "video"
          );
          break;
        }

        case "setDesktopState": {
          await this.setProducerState(
            signal.message.peerId,
            signal.message.state,
            "desktopAudio"
          );
          await this.setProducerState(
            signal.message.peerId,
            signal.message.state,
            "desktopVideo"
          );
          break;
        }

        // -----------------------------------------------------------------------------------------------

        case "hushPeers": {
          this.hushRoom(signal.message.peerId);
          break;
        }

        case "hushUser": {
          this.hushPeer(signal.message.peerId, signal.message.hushed);
          break;
        }

        case "peerIndicators": {
          this.sendPeerIndicators(
            signal.message.peerId,
            signal.message.indicators
          );
          break;
        }

        case "replyPeerIndicators": {
          this.replyPeerIndicators(
            signal.message.originId,
            signal.message.peerId,
            signal.message.indicators
          );
          break;
        }

        case "bootPeer": {
          this.bootUser(signal.message.peerId);
          break;
        }

        case "disconnectPeerWebsocket": {
          console.log(
            "Disconnecting peer at peer connection manager",
            signal.message
          );
          this.disconnectPeerWebsocket(signal.message.transport);
          break;
        }
        case "producerClose": {
          this.producerClose(
            signal.message.peerId,
            signal.message.producerId,
            signal.message.mediaType
          );
          break;
        }

        // -----------------------------------------------------------------------------------------------
        case "beginSendingStats": {
          console.log("Begin sending stats output to analytics front end");

          const beginSendingStats = () => {
            if (
              typeof process !== "undefined" &&
              typeof process.send !== "undefined"
            ) {
              process.send({
                stats: {
                  peers: Object.fromEntries(peers),
                  rooms: Object.assign({}, rooms),
                },
              });
            } else {
              console.error("process or process.send is not defined");
            }

            // TODO: check flag if we need to stop calling this function
            this.#statsTimeout = setTimeout(beginSendingStats, 1000);
          };

          beginSendingStats();
          break;
        }

        case "endSendingStats": {
          console.log("End sending stats output to analytics front end");
          clearTimeout(this.#statsTimeout);
          break;
        }
        case "restartIce": {
          this.restartIce(signal.message);
          break;
        }
        default: {
          console.log("Unknown message type!", signal);
        }
      }
    } catch (e) {
      console.error("Error processing peer manager command!", e, ipcmessage);
      return { ws: ipcmessage.ws, communication: false };
    }
  }

  // Peers and Rooms--------------------------------------------------------------------------------------

  /**
   * Register new peer in the provided room, with the provided
   * websocket signaling transport id,
   * then send identity data back to requesting client
   * @param wsid {string} Identification for the signaling transport of the peer
   * @param region {string} geographic area where peer is connecting from
   * @return {string} New peer id
   */
  createPeer(wsid: Guid, region: string) {
    // Find if there is a peer with the same wsid, which
    // means that the peer has reconnected
    let peer = Array.from(peers.values()).find(
      (peer) => peer.transportSignal === wsid
    );

    if (peer) {
      console.info(`#${peer.id}# -- Peer ${peers.size} reconnected`);
      peer.region = region;
      peers.set(peer.id, peer); //Update peer in peers list
    } else {
      peer = {
        id: uuid() as Guid, //Generate unique peer id
        transportSignal: wsid,
        deviceRTPCapabilities: undefined,
        room: undefined,
        debug: undefined,
        region: region,
        isLobby: true,
        isParticipant: false,
        isSpectator: false,
        ingress: undefined,
        egress: undefined,
        movement: undefined,
        deviceCapabilities: undefined,
        sctpOptions: undefined,
        audioProducer: undefined,
        videoProducer: undefined,
        desktopAudioProducer: undefined,
        desktopVideoProducer: undefined,
      };
      peers.set(peer.id, peer); //Add peer to peers list
      console.info(`#${peer.id}# -- Peer ${peers.size} was given identity`);
    }

    //Send the identification reply to requesting peer
    this.sendSignal(peer.transportSignal, {
      type: "identity",
      data: {
        id: peer.id,
        region: peer.region,
      },
    });
  }

  /**
   * Set peer object to contain each ingress/egress server
   * and also instruct each media server to join this peer to a room
   * This logic makes sure each peer is connected to everywhere it needs to be
   * to receieve and relay media and data while joined to a room.
   *
   * Note: region is exposed because not always will the peer want to connect from the peer's region
   * @param peerId {string} ID to lookup and act on peer
   * @param room {string} Name of the room the peer is to join
   * @param region {string} Geographic area where the peer will connect from
   */
  joinRoom(peerId: Guid, room: string) {
    const joiningPeer = peers.get(peerId);
    if (!joiningPeer) {
      console.error("cannot find peer: ", peerId);
      return;
    }
    joiningPeer.room = room;

    //Announce peer indicators to signify new peer has joined (via signaling)
    //this.sendPeerIndicators(peerId, {}, room);

    //Join the peer to existing transports

    // Get room, and create room-tracking object if not exist
    let joiningRoom = rooms.get(room);
    if (joiningRoom === undefined) {
      joiningRoom = {
        ingress: [],
        egress: [],
        movement: [],
      };
    }

    //Join peer to all egress that this room has entries on
    joiningRoom.egress.forEach((egressId) => {
      this.signalRouter.requestJoin(
        room,
        joiningPeer.transportSignal,
        "egress",
        egressId
      );
    });

    //Select least loaded servers for peer

    //Get an ingress and egress server to use for this peer
    const selectedIngress = this.signalRouter.getIngress(joiningPeer.region);
    const selectedEgress = this.signalRouter.getEgress(joiningPeer.region);
    const selectedMovment = this.signalRouter.getMovement(joiningPeer.region);

    if (!selectedIngress || !selectedEgress) {
      console.error("Unable to join room - no available egress or ingress");
      return;
    }
    // joining only your own ingress
    //TODO need to redo the logic once we scale ingress
    this.signalRouter.requestJoin(
      room,
      joiningPeer.transportSignal,
      "ingress",
      selectedIngress
    );

    //If movement server is plugged in, send off these messages
    if (selectedMovment) {
      this.signalRouter.requestJoin(
        room,
        joiningPeer.transportSignal,
        "movement",
        selectedMovment
      );
      joiningPeer.movement = selectedMovment;
      //Append movement servers to room object, for potential future use
      if (
        joiningPeer.movement &&
        !joiningRoom.movement.includes(joiningPeer.movement)
      ) {
        joiningRoom.movement.push(joiningPeer.movement);
      }
    }

    joiningPeer.ingress = selectedIngress;
    joiningPeer.egress = selectedEgress;
    peers.set(peerId, joiningPeer); //Save peer data
    if (!joiningPeer.ingress || !joiningPeer.egress) {
      console.debug("no selected ingress/egress");
      return;
    }
    //Append ingress servers to room object, for potential future use
    if (!joiningRoom.ingress.includes(joiningPeer.ingress)) {
      joiningRoom.ingress.push(joiningPeer.ingress);
    }

    //Append egress servers to room object and send, if new
    if (!joiningRoom.egress.includes(joiningPeer.egress)) {
      joiningRoom.egress.push(joiningPeer.egress);
      //Foreach peer in this room that is not from this egress
      // send out a notice that they need to add this egress
      //This is so peers already connected need to be told when a new
      // egress server joins the room network.
      for (const peerData of peers.values()) {
        if (peerData.room !== room || peerData.egress === selectedEgress) {
          console.debug(
            "Don't send to peers who don't need it: peerId: ",
            peerData.id
          );
          continue;
        }

        this.signalRouter.requestJoin(
          room,
          peerData.transportSignal,
          "egress",
          joiningPeer.egress
        );
      }

      //Join egress server, since its new
      this.signalRouter.requestJoin(
        room,
        joiningPeer.transportSignal,
        "egress",
        joiningPeer.egress
      );
    }
    //Save objects reflecting state, and send peer counts
    rooms.set(room, joiningRoom);
    this.signalRouter.setRoute(room, joiningRoom);
    //this.getPeerCount(peerId, [room]); //Send peer counts to client
  }

  /**
   * Remove peer from a room, and all associated transports and data
   * @param peerId {string} ID to lookup and act on peer
   * @param room {string} Name of the room the peer is to join
   */
  async leaveRoom(leavingPeerId: Guid, room: string) {
    const leavingPeerData = peers.get(leavingPeerId);
    if (!leavingPeerData) {
      console.error("cannot find peer leavingRoom: ", leavingPeerId);
      return;
    }
    //Instruct media server to disconnect
    const closeTransportSignal: ResponseMessage = {
      wsid: leavingPeerData.transportSignal,
      message: {
        type: "disconnectTransport",
        data: { peerId: leavingPeerId },
      } as MessageResponse,
    };
    this.signalRouter.closeIngressTransport(
      closeTransportSignal,
      leavingPeerData.ingress
    );
    // find egress server for the peer
    const roomData = rooms.get(room);
    if (!roomData) {
      console.debug(
        "no room found for the peer: ",
        leavingPeerId,
        "for room: ",
        room
      );
      return;
    }
    roomData.egress.forEach((egressId) => {
      this.signalRouter.closeEgressTransport(closeTransportSignal, egressId);
    });

    //Send disconnect signal to peers in a room that a peer has left
    for (const peerData of peers.values()) {
      if (room !== peerData.room) {
        console.debug(
          "Peers are in different rooms. Do not announce leave of peerid: ",
          peerData.id
        );
        continue;
      }

      if (peerData.id === leavingPeerId) {
        console.debug("Do not send leave room to self.");
        continue;
      }

      //Send disconnect signal to peers
      this.sendSignal(peerData.transportSignal, {
        type: "peerDisconnect",
        data: { peer: leavingPeerId },
      });
    }
    // check if room exist in peerCount
    if (!this.peerCount.get(room)) {
      console.error("peerCount of room: ", room, "not found!");
      return;
    }
    // decrement peer count
    if (leavingPeerData) {
      const peerCount = this.peerCount.get(room);
      peerCount.peerCount--;
      //Also decrease participant if peer was participant
      if (leavingPeerData.isParticipant) {
        peerCount.participantCount--;
      }
      if (leavingPeerData.isSpectator) {
        peerCount.spectatorCount--;
      }
      //Also decrease lobby count if peer was in lobby
      if (leavingPeerData.isLobby) {
        if (peerCount.lobbyCount > 0) {
          peerCount.lobbyCount--;
        }
      }
      this.peerCount.set(room, peerCount); //Save peer count back

      //Send out websocket event for peer count update
      this.sendPeerCount(leavingPeerData.id, room);
      // send destroyRouterGroup when websocket is still conenected use case transitions
      if (peerCount.participantCount === 0 && peerCount.lobbyCount === 0) {
        if (leavingPeerData.room) {
          this.peerCount.delete(room);
        }
        rooms.delete(room);
        const closeRoomSignal: ResponseMessage = {
          wsid: "api",
          message: {
            type: "destroyRouterGroup",
            data: { room: leavingPeerData.room },
          } as MessageResponse,
        };
        this.signalRouter.closeRoom(closeRoomSignal, leavingPeerData.room);
      }
    }

    //Remove the room from the peer data
    leavingPeerData.room = undefined; //leavingPeerData.room.filter(e => e !== room);
    leavingPeerData.isLobby = true;
    leavingPeerData.isSpectator = false;
    leavingPeerData.isParticipant = false;
    leavingPeerData.ingress = undefined;
    leavingPeerData.egress = undefined;
    peers.set(leavingPeerId, leavingPeerData);

    console.log("#", leavingPeerId, "# Peer left room", room);
  }

  /* return the peer counts for requested room */
  getPeerCount(peerId: Guid, roomNames: string[]) {
    const peer = peers.get(peerId);
    if (!peer) {
      console.error("cannot find peer getPeerCount: ", peerId);
      return;
    }
    const countList: any = new Object();

    //Set to all rooms when no room is defined
    if (!roomNames) {
      roomNames = Object.keys(this.peerCount);
    }

    roomNames.forEach((room) => {
      //Prep data if its not there
      let peerCount = this.peerCount.get(room);
      if (!peerCount) {
        peerCount = new Object({
          lobbyCount: 0,
          spectatorCount: 0,
          peerCount: 0,
          participantCount: 0,
        }) as PeerCounter;
        this.peerCount.set(room, peerCount); //Save new peer count
      }

      countList[room] = peerCount;
    });
    //Send out peer count to requesting peer
    this.sendSignal(peer.transportSignal, {
      type: "peerCount",
      data: countList,
    });
  }

  //Send count metrics to all peers in a room
  sendPeerCount(excludeId: Guid | undefined, room: string) {
    const countList: any = new Object();
    let peerCount = this.peerCount.get(room);
    if (!peerCount) {
      peerCount = new Object({
        lobbyCount: 0,
        spectatorCount: 0,
        peerCount: 0,
        participantCount: 0,
      }) as PeerCounter;
    }

    countList[room] = peerCount;
    this.peerCount.set(room, peerCount); //Save new peer count

    for (const recvPeer of peers.values()) {
      if (recvPeer.room === room && recvPeer.id !== excludeId) {
        this.sendSignal(recvPeer.transportSignal, {
          type: "peerCount",
          data: countList,
        });
      }
    }
  }

  // Create and Connect Transports -----------------------------------------------------------------------

  /**
   * Client uses ingress transports to send data from the client to the mediaserver.
   * This function sends the client's transport request data to the mediaserver,
   * The response will come back to a different function, that will send it back to the client
   * @param peerId {string} UUID of the peer to create transports for
   * @param sctpOptions {Object} Stream Control options (from client browser abilities)
   * @param rtpCapabilities {Object} Media options (from client browser abilities)
   */
  createIngressTransport(
    peerId: Guid,
    sctpOptions: NumSctpStreams,
    rtpCapabilities: RtpCapabilities
  ) {
    const transportingPeer = peers.get(peerId);
    if (!transportingPeer) {
      console.error("cannot find peer on createIngressTransport: ", peerId);
      return;
    }
    transportingPeer.deviceRTPCapabilities = rtpCapabilities;
    transportingPeer.sctpOptions = sctpOptions;
    peers.set(transportingPeer.id, transportingPeer);
    //TODO: Hook back in
    //metricsBindPeer(transportingPeer.id, transportingPeer);

    //Forward signaling data to create ingress transports to egress servers
    const createTransportSignal: ResponseMessage = {
      wsid: transportingPeer.transportSignal,
      message: {
        type: "createWebRTCIngress",
        data: {
          peerId: transportingPeer.id,
          sctpOptions: sctpOptions,
          routerNetwork: transportingPeer.room,
          routerPipes: this.signalRouter.getRouteEgress(transportingPeer.room),
        },
      } as MessageResponse,
    };
    this.signalRouter.requestIngressTransport(
      createTransportSignal,
      transportingPeer.ingress
    );
    if (!transportingPeer.room) {
      console.debug("cannot find room");
      return;
    }
    //Increase peer count when an ingress connection is made
    let peerCount = this.peerCount.get(transportingPeer.room);
    if (!peerCount) {
      peerCount = new Object({
        lobbyCount: 0,
        spectatorCount: 0,
        peerCount: 0,
        participantCount: 0,
      }) as PeerCounter;
    }
    peerCount.lobbyCount++;
    peerCount.peerCount++;

    this.peerCount.set(transportingPeer.room, peerCount);

    //Send out websocket event for peer count update
    this.sendPeerCount(undefined, transportingPeer.room);
  }

  /**
   * Client uses egress transports to send data from the mediaservers to the client.
   * This function sends the client's transport request data to the mediaserver,
   * The response will come back to a different function, that will send it back to the client
   * @param peerId {string} UUID of the peer to create transports for
   * @param sctpOptions {Object} Stream Control options (from client browser abilities)
   * @param rtpCapabilities {Object} Media options (from client browser abilities)
   * @param remoteEgress {String} HACK: override the egress this message is sent to
   */
  createEgressTransport(
    peerId: Guid,
    sctpOptions: NumSctpStreams,
    rtpCapabilities: RtpCapabilities,
    remoteEgress: Guid
  ) {
    const transportingPeer = peers.get(peerId);
    if (!transportingPeer) {
      console.error("cannot find peer on createEgressTransport: ", peerId);
      return;
    }
    transportingPeer.deviceCapabilities = rtpCapabilities;
    transportingPeer.sctpOptions = sctpOptions;
    peers.set(transportingPeer.id, transportingPeer);

    //Forward signaling data to create egress transport to egress servers
    const createTransportSignal: ResponseMessage = {
      wsid: transportingPeer.transportSignal,
      message: {
        type: "createWebRTCEgress",
        data: {
          peerId: transportingPeer.id,
          sctpOptions: sctpOptions,
          routerNetwork: transportingPeer.room,
        },
      } as MessageResponse,
    };
    if (remoteEgress) {
      this.signalRouter.requestEgressTransport(
        createTransportSignal,
        remoteEgress
      );
    } else {
      this.signalRouter.requestEgressTransport(
        createTransportSignal,
        transportingPeer.egress
      );
    }
  }

  /**
   * After creation of a transport, it can connect.
   * This function sends the client's transport connection data to the mediaservers
   * The response will come back to a different function, that will send it back to the client
   * @param peerId {string} UUID of the peer to connect the transport for
   * @param direction {string} Directionality of the transport, being send or receive
   * @param dtlsParameters {Object} Datagram Security options provided by client browser
   * @param remoteEgress {String} HACK: override the egress this message is sent to
   */
  connectPeerTransport(
    peerId: Guid,
    direction: string | undefined,
    dtlsParameters: DtlsParameters,
    remoteEgress?: Guid
  ) {
    const connectingPeer = peers.get(peerId);
    if (!connectingPeer) {
      console.error("cannot find peer on connectingPeer: ", peerId);
      return;
    }
    if (direction === "send") {
      if (!connectingPeer || !connectingPeer.room) {
        console.log("no connectingPeer or room");
        return;
      }
      //Record that peer is a participant in this room
      // (because they are sending up data to be sent elsewhere)
      connectingPeer.isParticipant = true;
      peers.set(peerId, connectingPeer);
      // Increment participant count
      const peerCount = this.peerCount.get(connectingPeer.room);
      peerCount.participantCount++;
      this.peerCount.set(connectingPeer.room, peerCount);

      //Send out websocket event for peer count update
      this.sendPeerCount(undefined, connectingPeer.room);

      //Forward connection data to ingress servers
      const connectTransportSignal: ResponseMessage = {
        wsid: connectingPeer.transportSignal,
        message: {
          type: "connectWebRTCIngress",
          data: { dtlsParameters: dtlsParameters, peerId: peerId },
        } as MessageResponse,
      };
      this.signalRouter.connectIngressTransport(
        connectTransportSignal,
        connectingPeer.ingress
      );
    } else {
      //Forward connection data to egress servers
      const connectTransportSignal: ResponseMessage = {
        wsid: connectingPeer.transportSignal,
        message: {
          type: "connectWebRTCEgress",
          data: { dtlsParameters: dtlsParameters, peerId: peerId },
        } as MessageResponse,
      };
      if (remoteEgress) {
        this.signalRouter.connectEgressTransport(
          connectTransportSignal,
          remoteEgress
        );
      } else {
        this.signalRouter.connectEgressTransport(
          connectTransportSignal,
          connectingPeer.egress
        );
      }
    }
  }

  // Consumers and Producers for Audio, Video, and Movement-----------------------------------------------

  /**
   * Multiple use function for creating either
   *  Audio, Video, or Movement consumer messages
   * This does not make the consumers, but rather constructs
   *  the messages to be sent via signaling to the media servers.
   *
   * @param peerId {string} UUID of the source peer (the one with the data to share)
   * @param type {String} Type of consumer (audio|video|movement)
   */
  createConsumerMessages(peerId: Guid, type: string, label: string) {
    const producerPeer = peers.get(peerId);
    //TODO: HACK: There should never be a case where the producer is not found
    // Thias does not solve the reason this was added, it only covers it up.
    if (!producerPeer) {
      console.error("The producer peer does not exist!", peerId, type, label);
      return false;
    }

    const egressMessages: NewConsumerSignal[] = [];

    //Send announcement to consume to all other peers in the room
    for (const consumerPeerData of peers.values()) {
      if (consumerPeerData.room !== producerPeer.room) {
        console.debug("Peers are in different rooms. Do not announce");
        continue;
      }

      //Do not attempt to consume self, unless frameEvents
      if (producerPeer.id === consumerPeerData.id && label !== "FrameEvents") {
        console.log(
          "Exclude peer consuming this audio from announcement. (Don't talk to ourselves)"
        );
        continue;
      }
      if (consumerPeerData.isLobby) {
        continue;
      }
      if (!consumerPeerData.room) {
        continue;
      }
      //Forward signaling data to create consumer of producerPeer's audio
      const newConsumerSignal: NewConsumerSignal = {
        wsid: consumerPeerData.transportSignal, //This means reply will go to consumerPeer. ;)
        message: {
          //type: "consumeAudio", "consumeVideo", "consumeMovement"
          data: {
            consumerPeer: consumerPeerData.id,
            producerPeer: [producerPeer.id],
            room: consumerPeerData.room,
          },
        },
      };

      //Adjust for differences between media/data
      if (type === "video" || type === "audio") {
        newConsumerSignal.message.type =
          type === "audio" ? "consumeAudio" : "consumeVideo";
        newConsumerSignal.message.data.rtpCaps =
          consumerPeerData.deviceRTPCapabilities;
      } else if (label === "AvatarMovement") {
        newConsumerSignal.message.type = "consumeMovement";
      } else if (label === "FrameEvents") {
        newConsumerSignal.message.type = "consumeEvents";
      } else {
        console.error("Unknown media type or datachannel label:", type, label);
      }
      egressMessages.push(newConsumerSignal);
    }

    return egressMessages;
  }

  /**
   * Drop a route from the connection manager
   * Clear all peers and objects with that route
   **/
  dropRoute(routeId: Guid) {
    //Remove any pees that are in this route
    for (const peerId of peers.keys()) {
      const somePeer = peers.get(peerId);
      if (somePeer) {
        if (somePeer.egress === routeId || somePeer.ingress === routeId) {
          this.disconnectPeerWebsocket(somePeer.transportSignal);
        }
      }
    }

    // For now, delete them
    //TODO: send out migrate signal to all peers in this room.
    rooms.forEach((routes, room) => {
      if (routes.egress.includes(routeId) || routes.ingress.includes(routeId)) {
        console.log("Room is stale on route", room, routeId);
        rooms.delete(room);
      }
    });
  }

  /**
   * Signal ingress server to create an audio producer
   * @note Triggers an announceAudio signal to other peers on completion
   * @param peerId {string} UUID of the source peer the audio is coming from
   * @param producerOptions {Object} Audio producer options
   */
  createAudioProducer(peerId: Guid, producerOptions: ProducerMediaOpts) {
    const producerPeer = peers.get(peerId);
    if (!producerPeer) {
      console.error("cannot find peer on createAudioProducer: ", peerId);
      return;
    }
    //Forward signaling data to create audio producer
    const createAudioProducerSignal: ResponseMessage = {
      wsid: producerPeer.transportSignal,
      message: {
        type: "createMediaProducer",
        data: {
          peerId: peerId,
          producerOptions: producerOptions,
          routerNetwork: producerPeer.room,
          rtpCapabilities: producerPeer.deviceCapabilities,
          egress: producerPeer.egress,
        },
      } as MessageResponse,
    };
    this.signalRouter.createAudioProducer(
      createAudioProducerSignal,
      producerPeer.ingress
    );
  }

  /**
   * Signal ingress server to create a video producer
   * @note Triggers an announceVideo signal to other peers on completion
   * @param peerId {string} UUID of the source peer the video is coming from
   * @param producerOptions {Object} Video producer options
   */
  createVideoProducer(peerId: Guid, producerOptions: ProducerMediaOpts) {
    const producerPeer = peers.get(peerId);
    if (!producerPeer) {
      console.error("cannot find peer on createVideoProducer: ", peerId);
      return;
    }
    //Forward signaling data to create video producer
    const createVideoProducerSignal: ResponseMessage = {
      wsid: producerPeer.transportSignal,
      message: {
        type: "createMediaProducer",
        data: {
          peerId: peerId,
          producerOptions: producerOptions,
          routerNetwork: producerPeer.room,
          rtpCapabilities: producerPeer.deviceCapabilities,
          egress: producerPeer.egress,
        },
      } as MessageResponse,
    };
    this.signalRouter.createVideoProducer(
      createVideoProducerSignal,
      producerPeer.ingress
    );
  }

  /**
   * Signal ingress server to create a data producer
   * This can be a movmement producer (unreliable)
   *  or a frame event producer (reliable)
   * @note Triggers an announceVideo signal to other peers on completion
   * @param peerId {string} UUID of the source peer the data is coming from
   * @param producerOptions {Object} Data producer options
   */
  createDataProducer(peerId: Guid, producerOptions: DataProducerOpts) {
    const producerPeer = peers.get(peerId);
    if (!producerPeer) {
      console.error("cannot find peer on createDataProducer: ", peerId);
      return;
    }
    //Forward signaling data to create data producer
    const createDataProducerSignal: ResponseMessage = {
      wsid: producerPeer.transportSignal,
      message: {
        type: "createDataProducer",
        data: {
          peerId: peerId,
          producerOptions: producerOptions,
          routerNetwork: producerPeer.room,
          egress: producerPeer.egress,
        },
      } as MessageResponse,
    };
    this.signalRouter.createMovementProducer(
      createDataProducerSignal,
      producerPeer.ingress
    );
  }

  /**
   * Signal ingress server to create a frame event producer
   * @param peerId {string} UUID of the peer to connect the transport for
   * @param producerOptions {Object} Data producer options
   */
  createEventProducer(peerId: Guid, producerOptions: DataProducerOpts) {
    const producerPeer = peers.get(peerId);
    if (!producerPeer) {
      console.error(
        "Producer peer is not defined! Send error signal back to client"
      );
      //TODO: make a handler that will send back error messages to the client
      //someHandler.send("this error");
      return;
    }

    //Forward signaling data to create data producer
    const createDataProducerSignal: ResponseMessage = {
      wsid: producerPeer.transportSignal,
      message: {
        type: "createEventProducer",
        data: {
          peerId: peerId,
          producerOptions: producerOptions,
          routerNetwork: producerPeer.room,
          egress: producerPeer.egress,
        },
      } as MessageResponse,
    };
    this.signalRouter.createEventProducer(
      createDataProducerSignal,
      producerPeer.ingress
    );
  }

  // Requests to consumer all media of a type-------------------------------------------------------------

  /**
   * Collect the ID of peers to consume audio from,
   *  which is any peer in this room that is not the source peer.
   * @note Triggers consumeAudio message containing all producerPeers to be sent to source peer
   * @param peerId {string} UUID of the peer to create consumers for (One consumer for each audio producer)
   */
  consumeAllAudio(peerId: Guid) {
    //Connect the peer to all existing audio producers
    const consumerPeer = peers.get(peerId);
    if (!consumerPeer) {
      console.error("cannot find peer ConsumeAllAudio: ", peerId);
      return;
    }
    //Build an announcement to send to the client, full of consumers
    const producerPeers: Guid[] = [];
    for (const producerPeerData of peers.values()) {
      if (producerPeerData.room !== consumerPeer.room) {
        console.debug("Peers are in different rooms. Do not announce");
        continue;
      }
      if (consumerPeer.id === producerPeerData.id) {
        console.log(
          "Exclude peer producing this audio from announcement. (Don't talk to ourselves)"
        );
        continue;
      }

      producerPeers.push(producerPeerData.id);
    }

    //Forward signaling data to correct egress servers,
    this.signalRouter.requestAllAudio(
      consumerPeer.transportSignal,
      consumerPeer.deviceRTPCapabilities,
      consumerPeer.id,
      consumerPeer.room,
      producerPeers
    );
  }

  /**
   * Collect the ID of peers to consume video from,
   *  which is any peer in this room that is not the source peer.
   * @note Triggers consumeVideo message containing all producerPeers to be sent to source peer
   * @param peerId {string} UUID of the peer to create consumers for (One consumer for each video producer)
   */
  consumeAllVideo(peerId: Guid) {
    //Connect the peer to all existing video producers
    const consumerPeer = peers.get(peerId);
    if (!consumerPeer) {
      console.error("cannot find peer on cosumeAllVideo: ", peerId);
      return;
    }
    //Build an announcement to send to the client, full of consumers
    const producerPeers: Guid[] = [];
    for (const producerPeerData of peers.values()) {
      if (producerPeerData.room !== consumerPeer.room) {
        console.debug("Peers are in different rooms. Do not announce");
        continue;
      }
      if (consumerPeer.id === producerPeerData.id) {
        console.debug(
          "Exclude peer producing this video from announcement. (Don't talk to ourselves)"
        );
        continue;
      }

      producerPeers.push(producerPeerData.id);
    }

    //Forward signaling data to correct egress servers,
    this.signalRouter.requestAllVideo(
      consumerPeer.transportSignal,
      consumerPeer.deviceRTPCapabilities,
      consumerPeer.id,
      consumerPeer.room,
      producerPeers
    );
  }

  /**
   * Collect the ID of peers to consume movement from,
   *  which is any peer in this room that is not the source peer.
   * @note Triggers consumeMovement message containing all producerPeers to be sent to source peer
   * @param peerId {string} UUID of the peer to create consumers for (One consumer for each movement producer)
   */
  consumeAllMovement(peerId: string, isSpectator: boolean) {
    //Connect the new peer to all existing recvTransports
    const consumerPeer = peers.get(peerId);
    if (!consumerPeer) {
      console.error("cannot find peer on consumerAllMovement: ", peerId);
      return;
    }
    if (consumerPeer.isLobby && consumerPeer.room) {
      const peerCount = this.peerCount.get(consumerPeer.room);
      if (peerCount.lobbyCount > 0) {
        peerCount.lobbyCount--;
      }
      consumerPeer.isLobby = false;
      if (isSpectator) {
        consumerPeer.isSpectator = true;
        peerCount.spectatorCount++;
      }
      peers.set(peerId, consumerPeer);
      this.peerCount.set(consumerPeer.room, peerCount);
      //Send out websocket event for peer count update
      //this.sendPeerCount(undefined, consumerPeer.room);
      //send out peer counts
    }

    //Build an announcement to send to the client, full of consumers
    const producingPeers: Guid[] = [];
    for (const producerPeerData of peers.values()) {
      if (producerPeerData.room !== consumerPeer.room) {
        console.debug("Peers are in different rooms. Do not announce");
        continue;
      }
      if (consumerPeer.id === producerPeerData.id) {
        console.debug(
          "Exclude peer producing this movement from announcement. (Don't talk to ourselves)"
        );
        continue;
      }

      producingPeers.push(producerPeerData.id);
    }

    //For webrtc movement
    //Signal to egress to create movement consumers and deliver them to client
    this.signalRouter.requestAllMovement(
      consumerPeer.transportSignal,
      consumerPeer.id,
      consumerPeer.room,
      producingPeers
    );
  }

  /**
   * Send to egress servers a list of movement producers to create consumers for and announce to the consuming peer
   * @param peerId {string} UUID of the peer to create consumers for (One consumer for each data producer)
   */
  consumeAllEvents(peerId: Guid) {
    //Connect the new peer to all existing recvTransports
    const consumerPeer = peers.get(peerId);
    if (!consumerPeer) {
      console.error("cannot find the peer on consumeAllEvents: ", peerId);
      return;
    }
    //Build an announcement to send to the client, full of consumers
    const producingPeers: Guid[] = [];
    for (const producerPeerData of peers.values()) {
      if (producerPeerData.room !== consumerPeer.room) {
        console.debug("Peers are in different rooms. Do not announce");
        continue;
      }
      if (consumerPeer.id === producerPeerData.id) {
        console.debug(
          "Exclude peer producing this event from announcement. (Don't talk to ourselves)"
        );
        continue;
      }
      producingPeers.push(producerPeerData.id);
    }

    //Forward signaling data to correct egress servers,
    //create consumer of producerPeer's audio
    // And then message is sent to client.
    this.signalRouter.requestAllEvents(
      consumerPeer.transportSignal,
      consumerPeer.id,
      consumerPeer.room,
      producingPeers
    );
  }

  muteProducer(peerId: Guid, producerId: Guid, type: string) {
    const producerPeer = peers.get(peerId);
    if (!producerPeer) {
      console.error(
        "Producer peer is not defined! Send error signal back to client"
      );
      //TODO: make a handler that will send back error messages to the client
      //someHandler.send("this error");
      return;
    }
    switch (type) {
      case "audio": {
        const message: ResponseMessage = {
          wsid: producerPeer.transportSignal,
          message: {
            type: "producerPause",
            data: {
              peerId: peerId,
              producerId: producerId,
              mediaType: type,
            },
          } as MessageResponse,
        };
        this.signalRouter.pauseProducer(message, producerPeer.ingress);
        break;
      }
      case "video":
        break;
    }
  }

  resumeProducer(peerId: Guid, producerId: Guid, type: string) {
    const producerPeer = peers.get(peerId);
    if (!producerPeer) {
      console.error(
        "Producer peer is not defined! Send error signal back to client"
      );
      //TODO: make a handler that will send back error messages to the client
      //someHandler.send("this error");
      return;
    }
    switch (type) {
      case "audio": {
        const message: ResponseMessage = {
          wsid: producerPeer.transportSignal,
          message: {
            type: "producerResume",
            data: {
              peerId: peerId,
              producerId: producerId,
              mediaType: type,
            },
          } as MessageResponse,
        };
        this.signalRouter.resumeProducer(message, producerPeer.ingress);
        break;
      }
      case "video":
        break;
    }
  }

  /**

     // Control producer and consumer states ----------------------------------------------------------------

     /**
     * Pause or Resume a producer, so that zero/little data is sent over the RTP layer. This is good.
     * @param peerId {string} UUID of the peer to pause/resume the producer for
     * @param state {boolean} True resumes the producer, false pauses it
     * @param type {string} Which producer to pause for this peer
     */
  async setProducerState(peerId: Guid, state: boolean, type: string) {
    const producerPeer = peers.get(peerId);
    if (!producerPeer) {
      console.error("cannot find peer on setProducerState: ", peerId);
      return;
    }
    //Set producer state
    switch (type) {
      case "audio":
        if (producerPeer.audioProducer) {
          if (state) {
            await producerPeer.audioProducer.resume();
          } else {
            await producerPeer.audioProducer.pause();
          }
        }
        break;
      case "video":
        if (producerPeer.videoProducer) {
          if (state) {
            await producerPeer.videoProducer.resume();
          } else {
            await producerPeer.videoProducer.pause();
          }
        }
        break;
      case "desktopAudio":
        if (producerPeer.desktopAudioProducer) {
          if (state) {
            await producerPeer.desktopAudioProducer.resume();
          } else {
            await producerPeer.desktopAudioProducer.pause();
          }
        }
        break;
      case "desktopVideo":
        if (producerPeer.desktopVideoProducer) {
          if (state) {
            await producerPeer.desktopVideoProducer.resume();
          } else {
            await producerPeer.desktopVideoProducer.pause();
          }
        }
        break;
      default:
        console.log("Unknown producer type");
    }

    return false;
  }

  // Signaling between peers -----------------------------------------------------------------------------
  /**
   * Administrative mute for all peers in a room. This pauses all the peer's producers, and sends a signal to peers that they have been administratively hushed.
   * @todo make this pause the producers...
   * @todo describe this differntly. This is a one-to-many broadcast with an action step (pause producer)
   * @todo the mechanic is independent of the use
   * @param peerId {string} UUID of the peer that issues the administrative hush command
   */
  hushRoom(peerId: Guid) {
    const hushedPeer = peers.get(peerId);
    if (!hushedPeer) {
      console.error("cannot find peer on hushRoom: ", peerId);
      return;
    }
    //Announce to other peers they have all been hushed
    for (const otherPeerData of peers.values()) {
      if (otherPeerData.room !== hushedPeer.room) {
        console.debug("Peers are in different rooms. Do not announce");
        continue;
      }
      if (otherPeerData.id === hushedPeer.id) {
        continue;
      }
      //peers[otherPeer].audioProducer.pause() //Mute peer audio producer
      this.sendSignal(otherPeerData.transportSignal, {
        type: "hushed",
        data: { peerId: otherPeerData.id },
      });
    }
    return false;
  }

  /**
   * Administrative mute for single user in a room. This pauses the peer's producer, and sends a signal to the peer that it has been administratively hushed.
   * @todo make this pause producers...
   * @param peerId {string} UUID of the peer that issues the administrative hush command
   * @param hushed {string} UUID of the peer that is being hushed
   */
  hushPeer(peerId: Guid, hushed: Guid) {
    const hushedPeer = peers.get(hushed);
    if (!hushedPeer) {
      console.error("cannot find peer on hushpeer: ", peerId);
      return;
    }
    this.sendSignal(hushedPeer.transportSignal, {
      type: "hushed",
      data: { peerId: peerId },
    });
    return false;
  }

  /**
   * Administrative forced disconnect for single user in a room. This is not a ban, only boot/kick/disconnect.
   * @todo make this check some kind of auth token...
   * @param peerId {string} UUID of the peer to disconnect
   */
  bootUser(peerId: Guid) {
    const bootedPeer = peers.get(peerId);
    if (!bootedPeer) {
      console.error("cannot find peer on bootUser: ", peerId);
      return;
    }
    this.sendSignal(bootedPeer.transportSignal, {
      type: "bootUser",
      data: { peerId },
    });

    this.disconnectPeerWebsocket(bootedPeer.transportSignal);
    return false;
  }

  /**
   * Announce source peer indicators to all other peers in the room of the source peers choosing.
   * This lets one peer send self-representive data to other peers when entering the room
   * @param peerId {string} UUID of the peer that issued the indicator announcement
   * @param indicators {Object} Peer avatar indicators, including apperance and status
   */
  sendPeerIndicators(peerId: Guid, indicators: any, room?: string) {
    const sourcePeer = peers.get(peerId);
    if (!sourcePeer) {
      console.log(`Peer ${peerId} is missing inside PeerIndicators`);
      return;
    }

    for (const otherPeerData of peers.values()) {
      if (!otherPeerData.room) {
        console.debug(
          `Other peer ${peerId} not in room. Do not send indicators: Total peers object: ${peers.size}`
        );
        continue;
      }

      //Toggle for room input
      if (room) {
        //If room is given, match other peer to room
        if (otherPeerData.room !== room) {
          console.debug(
            "Other peer is not in the given room. Do not send peer indicator"
          );
          continue;
        }
      } else {
        //If room is not given, match other peer to room as server knows it
        if (otherPeerData.room !== sourcePeer.room) {
          console.debug("Peers are in different rooms. Do not announce");
          continue;
        }
      }

      if (sourcePeer.id === otherPeerData.id) {
        console.debug(
          "\tDont send indicator announcement to self (dont talk to ourselves)"
        );
        continue;
      }
      this.sendSignal(otherPeerData.transportSignal, {
        type: "peerIndicators",
        data: {
          indicators: indicators,
          peerId: peerId,
        },
      });
    }
  }

  /**
   * Reply to a peer's indicator with the indicator of the receiving peer
   * This is to make sure the peer who sent their information to all peers,
   *  also knows what all the peers look like.
   * @param originId {string} UUID of the peer that issued the indicator announcement
   * @param peerId {string} UUID of the peer that is indicated by the announcement
   * @param indicators {Object} Peer avatar indicators of the replying peer, so that the original peer has that indicator data.
   */
  replyPeerIndicators(originId: Guid, peerId: Guid, indicators: any) {
    const originalPeer = peers.get(originId);
    if (originalPeer) {
      this.sendSignal(originalPeer.transportSignal, {
        type: "peerIndicatorsReply",
        data: {
          indicators: indicators,
          peerId: peerId,
        },
      });
    }
  }

  // Disconnect and cleanups -----------------------------------------------------------------------------

  /**
   * Remove a peer from the room, removing any associations to other peers,
   *  and then disconnecting the signaling transport.
   * @param transport {string} Signaling transport of the peer to disconnect
   */
  disconnectPeerWebsocket(transport: Guid) {
    if (!transport) {
      console.error("No transport: ", transport);
      return;
    }
    //Loop one: Find peer with correct transport
    //console.log("@@ peers: ", peers);
    const peerArray = Array.from(peers.values());
    const disconnectingPeer = peerArray.find(
      (peerData) => peerData.transportSignal === transport
    );
    console.log("disconnect peer: ", disconnectingPeer);
    if (!disconnectingPeer) {
      console.error(
        "Disconnecting peer websocket called, but peer is not in peers array!",
        disconnectingPeer,
        transport
      );
      return;
    }
    //Instruct media server to disconnect
    const closeTransportSignal: ResponseMessage = {
      wsid: transport,
      message: {
        type: "disconnectTransport",
        data: { peerId: disconnectingPeer.id },
      } as MessageResponse,
    };
    // do the same as egress when we in the stage of having multiple ingress
    this.signalRouter.closeIngressTransport(
      closeTransportSignal,
      disconnectingPeer.ingress
    );

    // find egress server for the peer
    const roomName: string | undefined = disconnectingPeer.room;
    if (!roomName) {
      return;
    }
    const room = rooms.get(roomName);
    if (!room) {
      console.log(
        `Room ${roomName} not found for the peer ${disconnectingPeer.id}`
      );
      peers.delete(disconnectingPeer.id);
      return;
    }

    room.egress.forEach((egressId) => {
      this.signalRouter.closeEgressTransport(closeTransportSignal, egressId);
    });

    //Remove peer from counter
    const peerCount = this.peerCount.get(roomName);
    peerCount.peerCount--;
    //Also decrease participant if peer was participant
    if (disconnectingPeer.isParticipant) {
      peerCount.participantCount--;
    }
    if (disconnectingPeer.isSpectator) {
      peerCount.spectatorCount--;
    }
    //Also decrease lobby count if peer was in lobby
    if (disconnectingPeer.isLobby) {
      if (peerCount.lobbyCount > 0) {
        peerCount.lobbyCount--;
      }
    }

    if (peerCount.participantCount < 1) {
      onLastPeerDisconnect(roomName);
    }

    this.peerCount.set(roomName, peerCount);

    //Send out websocket event for peer count update
    if (disconnectingPeer.room) {
      this.sendPeerCount(disconnectingPeer.id, disconnectingPeer.room);
    }

    peers.delete(disconnectingPeer.id);

    //Badly determine if this is the last peer on this server
    let numberOfPeers = 0;
    for (const connectedPeerData of peers.values()) {
      if (!roomName || !connectedPeerData.id || !connectedPeerData.room) {
        continue;
      }
      if (roomName !== connectedPeerData.room) {
        console.debug(
          "Peers are in different rooms. Do not announce peerId: ",
          connectedPeerData.id
        );
        continue;
      }
      numberOfPeers++;
      //Send disconnect signal to peers
      this.sendSignal(connectedPeerData.transportSignal, {
        type: "peerDisconnect",
        data: { peer: disconnectingPeer.id },
      });
    }

    //Instruct media servers to close their routernetworks for empty rooms
    // TODO remove this roomName check after this is fixed
    if (numberOfPeers === 0) {
      this.peerCount.delete(roomName);
      rooms.delete(roomName);
      const closeRoomSignal: ResponseMessage = {
        wsid: "api",
        message: {
          type: "destroyRouterGroup",
          data: { room: roomName },
        } as MessageResponse,
      };
      this.signalRouter.closeRoom(closeRoomSignal, roomName);
    }

    //This means nothing will attempt to send on a closed websocket
    return false;
  }

  producerClose(peerId: Guid, producerId: Guid, mediaType: string) {
    const peerData = peers.get(peerId);
    if (peerData) {
      const message: ResponseMessage = {
        wsid: peerData.transportSignal,
        message: {
          type: "producerClose",
          data: {
            peerId,
            producerId,
            mediaType,
          },
        } as MessageResponse,
      };
      this.signalRouter.producerClose(
        message,
        peerData.ingress,
        peerData.egress
      );
    }
  }

  restartIce(params: RestartIce) {
    const peer = peers.get(params.peerId);
    if (!peer) {
      console.log(`restartIce: No peer found for ${params.peerId}`);
      return;
    }
    const wsid = peer.transportSignal;
    const message: ResponseMessage = {
      wsid,
      message: {
        type: "restartIce",
        data: {
          transportId: params.transportId,
          peerId: params.peerId,
        },
      } as MessageResponse,
    };
    this.signalRouter.restartIce(wsid, message, params.ingress, params.egress);
  }

  //
  // Private API
  //

  #statsTimeout: NodeJS.Timeout | undefined;
};

function onLastPeerDisconnect(roomName: string) {
  resetDefaultSlide(roomName);
  updateLastVisited(roomName);
}

module.exports = peerConnectionManager;
