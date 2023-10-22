import { CommunicationResponse } from "./../../libs/signalRouterTypes";
import {
  Guid,
  ProducerMediaOpts,
  RequestMessageType,
  TypeOfRequestMessage,
} from "./../../libs/peerTypes";
/**
 * @file Base functionality for coordinating avatar datastreams and signaling the communications server.
 */
import stateManager from "./state";
import branding from "./branding.js";
import { setAvatar, setFacade, setBoundAssets } from "./stateHandlers.js";
import {
  MovementTransport,
  PacketHeader,
  movementToJSON,
} from "./movementProtocol";
import { Device } from "mediasoup-client";
import waitFor from "./utils/waitFor";
import region from "./utils/region";
import streamManager from "./streamManager.js";
import {
  AudioConsumer,
  AudioProducer,
  CallBackHandler,
  ConsumerTransports,
  FrameEventsConsumers,
  MovementConsumers,
  ProducerTransports,
  ScreenAudioProducer,
  ScreenVideoProducer,
  SignalTransport,
  VideoConsumer,
  VideoProducer,
  MovementProducer,
  FrameEventsHandler,
  EventHandler,
  FrameEventsProducer,
  screenAudioConsumers,
  screenVideoConsumers,
  PeerCallBackHandler,
  MediaCallBackHandler,
  IndicatorCallBackHandler,
  StateCallBackHandler,
  MediaStreams,
  MovementCallBackHandler,
  LeaveCallBackHandler,
  EnterCallBackHandler,
} from "./avatarTypes.js";
import { SctpParameters } from "mediasoup-client/lib/SctpParameters";
import {
  DtlsParameters,
  IceCandidate,
  IceParameters,
} from "mediasoup-client/lib/Transport";
import {
  BoundAssetStreamingScreen,
  isStreamingScreen,
} from "./types/AssetBinding";

declare global {
  interface Window {
    avatarDebug?: any; // You can replace `any` with the actual type of `avatarDebug` if it's known.
  }
}
export class avatar {
  regionalMovementServer: boolean;
  room: string;
  consumerTransport: ConsumerTransports;
  producerTransport: ProducerTransports;
  signalTransport: SignalTransport;
  movementTransport: WebSocket;
  iceHandler: () => Promise<any[]>;
  peerVideoHandler: MediaCallBackHandler;
  peerAudioHandler: MediaCallBackHandler;
  peerDisconnectHandler: CallBackHandler;
  videoProducer: VideoProducer;
  audioProducer: AudioProducer;
  screenVideoProducer: ScreenVideoProducer;
  screenAudioProducer: ScreenAudioProducer;
  videoProducerId: Guid | undefined;
  audioProducerId: Guid | undefined;
  audioProduced: boolean;
  screenVideoProducerIds: Guid[];
  screenAudioProducerIds: Guid[];
  audioConsumers: AudioConsumer;
  audioConsumerState: boolean[];
  videoConsumers: VideoConsumer;
  screenAudioConsumers: screenAudioConsumers;
  screenVideoConsumers: screenVideoConsumers;
  movementProducerId: Guid | undefined;
  movementProducer: MovementProducer;
  movementConsumers: MovementConsumers;
  peerMovementHandler: MovementCallBackHandler;
  frameEventsProducerId: undefined | string;
  frameEventsProducer: FrameEventsProducer;
  frameEventsConsumers: FrameEventsConsumers;
  frameEventsHandler: FrameEventsHandler;
  peerCountHandler: PeerCallBackHandler;
  avatarMeta: any;
  numWebsocketReconnects: number;
  avatarMover: MovementTransport;
  reconnecting: boolean;
  consumerConnected: boolean;
  webRTCDevice: Device;
  movementChannelClosedWarning: boolean;
  identityHandler: CallBackHandler;
  peerIndicatorsHandler: IndicatorCallBackHandler;
  peerAudioStateHandler: StateCallBackHandler;
  peerVideoStateHandler: StateCallBackHandler;
  peerChildrenHandler: CallBackHandler;
  peerMuteHandler: CallBackHandler;
  hushedHandler: CallBackHandler;
  leaveHandler: LeaveCallBackHandler;
  avatar_id: string;
  enterHandler: EnterCallBackHandler;
  movementServerConnectionAttempt: number;
  region: string;
  getMovementServerTimeout: NodeJS.Timeout;
  movementReconnecting: boolean;
  producerConnected: boolean;
  /**
   * Manages the client-side representation of the avatar.
   * This includes audio, video, movement, and events sent in and about the frame.
   * This component stands alone and will not require modificaton in your webapp.
   * If you would like your webapp to respond to things the avatar sees or does, see the avatar-harness.js
   **/
  constructor() {
    this.regionalMovementServer = false; //Enable movement server suited to regional events
    this.room = window.location.pathname.substring(1);
    this.consumerTransport = [];
    this.producerTransport = undefined;
    this.signalTransport = undefined;
    this.iceHandler = async () => [];
    this.peerVideoHandler = undefined;
    this.peerAudioHandler = undefined;
    this.peerDisconnectHandler = undefined;
    // TODO below change these to array
    this.videoProducer = undefined;
    this.audioProducer = undefined;
    this.screenVideoProducer = [];
    this.screenAudioProducer = [];
    // TODO remove once array is in place
    this.videoProducerId = undefined;
    this.audioProducerId = undefined;
    this.audioProduced = false;
    this.screenVideoProducerIds = [];
    this.screenAudioProducerIds = [];

    //Peer consumers lists
    this.audioConsumers = [];
    this.audioConsumerState = [];
    this.videoConsumers = [];
    this.screenAudioConsumers = [];
    this.screenVideoConsumers = [];

    // Datachannel for Avatar Movements
    this.movementProducerId = undefined;
    this.movementProducer = undefined;
    this.movementConsumers = {};
    this.peerMovementHandler = undefined;

    // Datachannel for frame events
    this.frameEventsProducerId = undefined;
    this.frameEventsProducer = undefined;
    this.frameEventsConsumers = {};
    this.frameEventsHandler = {};

    this.peerCountHandler = undefined;

    this.avatarMeta = undefined;
    this.numWebsocketReconnects = 0;
    this.consumerConnected = false;
    this.avatarMover = new MovementTransport();
    this.producerConnected = false;

    //Subscribe to changes in showing/hiding the load screen
    stateManager.subscribe(
      (state) => state.isDebugMode,
      (debug) => {
        const search = new URLSearchParams(window.location.search);
        if (!search.has("avatar-data")) {
          debug = false;
        }
        if (debug) {
          window.avatarDebug = this;

          const statusLoop = () => {
            console.log("THIS", this);
            console.log("Avatar stat dump:");
            console.log("Room: ", this.room);
            console.log("Consumer Transport: ", this.consumerTransport);
            console.log("Producer Transport: ", this.producerTransport);
            console.log("Signal Transport: ", this.signalTransport);
            console.log("Video Producer: ", this.videoProducer);
            console.log("Audio Producer: ", this.audioProducer);
            console.log(
              "ScreenShare Video Producer: ",
              this.screenVideoProducer
            );
            console.log(
              "ScreenShare Audio Producer: ",
              this.screenAudioProducer
            );
            console.log("Audio Consumers: ", this.audioConsumers);
            console.log("Video Consumers: ", this.videoConsumers);
            console.log(
              "ScreenShare Video Consumers: ",
              this.screenAudioConsumers
            );
            console.log(
              "ScreenShare Audio Consumers: ",
              this.screenVideoConsumers
            );
            console.log("Movement Producer: ", this.movementProducer);
            console.log("Movement Consumers: ", this.movementConsumers);
            console.log("Event Producer: ", this.frameEventsProducer);
            console.log("Event Consumers: ", this.frameEventsConsumers);
            console.log("Avatar Metadata: ", this.avatarMeta);

            //Re-call this function to loop-print stats
            setTimeout(statusLoop, 10000);
          };
          console.log(typeof statusLoop);
        }
      },
      {
        fireImmediately: true,
      }
    );
  }

  websocketReady() {
    return (
      this.signalTransport && this.signalTransport.readyState === WebSocket.OPEN
    );
  }

  allConnectionsConnected() {
    return (
      this.websocketReady() &&
      this.producerTransport?.connectionState === "connected" &&
      Object.values(this.consumerTransport).every((transport) => {
        return transport.connectionState === "connected";
      })
    );
  }

  /**
   * Establish the avatar's connection to the api server via websocket
   * @note Connect will not request an identity if not given a room. This can be useful
   *       when the webapp does not know the frame name, like in cases where the URL can not
   *       hold the frame name.
   * @param signalingURL - FQDN of the signaling server
   * @param uuid - Connection ID if reconnecting
   */
  connect(signalingURL: string, uuid?: string) {
    // Initialize websocket signal relay
    console.log("Initializing client-side avatar connection to", signalingURL);
    if (!this.websocketReady()) {
      // const url = `$signalingURL + "/signaling";
      this.signalTransport = new WebSocket(
        `${signalingURL}/signaling${uuid ? `?uuid=${uuid}` : ``}`
      );
    }
    if (!this.signalTransport) {
      console.debug("the websocket is not ready!");
      return;
    }
    this.signalTransport.onclose = (event) => {
      console.error("Connection to signaling server closed", event);

      // Get the room name from state again
      this.room = stateManager.getState().frame.name;

      // When we reconnect, we reuse the existing avatar UUID
      if (!event.wasClean && this.room) {
        //this.reconnecting = true;
        // deep clean start from zero
        //this.leaveCleanup(false);

        //if (this.numWebsocketReconnects < 5) {
        //  this.numWebsocketReconnects++;
        //  setTimeout(() => {
        //    this.connect(signalingURL, this.avatar_id);
        //  }, 1000);
        //} else {
        //  //Show user this un-recoverable failure
        //  stateManager.getState().addNotification({
        //    dismissable: true,
        //    text: `Oops! Signaling connection attempted to reconnect, and failed! Please refresh.`,
        //  });
        //}

        console.warn(
          "Oops! Signaling connection was not cleanly closed!",
          event
        );
      } else {
        console.warn(
          "Signaling connection has closed. User will need to refresh the application page."
        );
        //Show user this un-recoverable failure
        stateManager.getState().addNotification({
          dismissable: true,
          text: `Oops! Connection to our server isn't working. Please refresh.`,
        });
      }
    };
    this.signalTransport.onmessage = this.incomingSignal.bind(this);
    this.signalTransport.onopen = async () => {
      this.send("requestIdentity", {
        region: await region(),
      });
    };

    // Initialize mediasoup device
    try {
      this.webRTCDevice = new Device();
    } catch (err) {
      this.webRTCDevice = new Device({ handlerName: "Safari12" });
      console.error(
        "Failed to load WebRTCDevice",
        err,
        "Forcing to Safari12 client type"
      );
    }
  }

  /**
   *  Join the avatar to the frame, but dont participate
   *  @public
   *  @param data - Invoke data channel?
   *  @param events - Invoke event channel?
   **/
  enterFrame(frameName: string) {
    this.send("joinRoom", {
      peerId: this.avatar_id,
      room: frameName,
    });
    //this.enterHandler?.(frameName);
  }

  /**
   *  Start the avatar, after its entered a frame.
   *  This produces movement data when called
   *  @note Must be called after enterFrame() is called
   *  @public
   *  @param data - Invoke data channel?
   *  @param events - Invoke event channel?
   **/
  async participate(data: boolean, events: boolean) {
    await waitFor(() => this.producerConnected === true);
    setFacade(stateManager.getState().facade);
    setAvatar({ lobby: false, spectate: !data });
    let isSpectator = false;
    function equal(buf1, buf2) {
      if (buf1.byteLength != buf2.byteLength) {
        return false;
      }
      const dv1 = new Int8Array(buf1);
      const dv2 = new Int8Array(buf2);
      for (let i = 0; i != buf1.byteLength; i++) {
        if (dv1[i] != dv2[i]) {
          return false;
        }
      }
      return true;
    }

    let currentMovement = new ArrayBuffer(148);
    let currentMovementView = new Uint8Array(currentMovement);

    // WebRTC movemenbt server
    if (data) {
      if (this.regionalMovementServer) {
        //Check if event movement server plugin is registered
        //Regional movement server
        this.avatarMover.sendMovement = (movement) => {
          if (currentMovement && equal(currentMovement, movement)) {
            return;
          }
          if (
            this.movementTransport &&
            this.movementTransport.readyState === WebSocket.OPEN
          ) {
            this.movementTransport.send(movement);
          } else {
            if (this.movementChannelClosedWarning) {
              return;
            }
            console.log("Attempting to send movement, but WebSocket is closed");
            this.movementChannelClosedWarning = true;
          }
          const movementView = new Uint8Array(movement);
          if (currentMovement.byteLength !== movement.byteLength) {
            currentMovement = new ArrayBuffer(movement.byteLength);
            currentMovementView = new Uint8Array(currentMovement);
          } else {
            currentMovementView.set(movementView);
          }
        };
        this.avatarMover.startSendingMovement();
      } else {
        // Use WebRTC movement server
        //Start movement producer
        await this.producerTransport
          ?.produceData({
            ordered: false,
            maxPacketLifeTime: 250,
            label: "AvatarMovement",
            appData: { source: "AvatarMovement" },
          })
          .then((producer) => {
            //Setup error and close handlers
            producer.on("error", (error: any) => {
              console.error("Movement producer error", error);
            });
            producer.on("close", () => {
              console.log("Movement producer closed");
            });

            //Emit avatar positions as soon as datachannel is open
            this.avatarMover.sendMovement = (movement) => {
              if (producer.readyState === "open") {
                producer.send(movement);
                this.movementChannelClosedWarning = false;
              } else {
                // To only log this once per state
                if (this.movementChannelClosedWarning) {
                  return;
                }
                console.warn(
                  "Attempting to send movement data when datachannel is closed..."
                );
                console.warn(
                  "The consumer appData: ",
                  producer.appData,
                  "isClosed",
                  producer.closed
                );
                console.warn(
                  "The producer readyState: ",
                  producer.readyState,
                  this.producerTransport
                );
                this.movementChannelClosedWarning = true;
              }
            };
            this.avatarMover.startSendingMovement();
            this.movementProducer = producer;
          })
          .catch((error) => {
            console.error("Producing movement failed!", error);
          });
      }
    }

    if (events) {
      //Start frame event producer
      //This is an ordered (reliable) datachannel
      if (!this.producerTransport) {
        console.debug("there is no event producerTransport");
        return;
      }
      await this.producerTransport
        .produceData({
          ordered: true,
          label: "FrameEvents",
          appData: { source: "FrameEvents" },
        })
        .then((producer) => {
          producer.on("error", (error: any) => {
            console.error("Frame Event producer error", error);
          });
          producer.on("close", () => {
            console.log("Frame Event producer closed");
          });
          this.frameEventsProducer = producer;
        })
        .catch((error) => {
          console.error("Producing frame events failed!", error);
        });
    }
    if (!data && !events) {
      isSpectator = true;
    }
    // // Request all existing media/data sources from remote peers
    this.getAudioAnnoucements();
    this.getVideoAnnoucements();
    this.getMovementAnnoucements(isSpectator);
    this.getEventsAnnoucements();
  }

  /**
   *  Add local media tracks to avatar, for relay to peer avatars
   *  this sends data across the network to the media servers
   *   - if the media is undefined, do not act on it
   *   - if the media is false, remove it from sending
   *   - if the media is a track, add it to the sending
   *  @public
   *  @param mediaStreams - Streams returned by requestMedia() for sending to other remote avatars
   **/
  async addMedia(mediaStreams: MediaStreams) {
    if (!mediaStreams) {
      // If no specific media streams are supplied,
      // request them from the stream manager
      mediaStreams = await streamManager.requestMedia({
        audio: stateManager.getState().avatar.audioMuted,
        video: false,
      });
    }
    //Create Audio producer, if present
    if (this.audioProduced === undefined) {
      console.debug("Audio track is undefined no action taken.");
    } else if (mediaStreams?.audioTrack === false) {
      //Remove media from avatar sending
      console.log("Stopping audio stream locally");
      stateManager.setState({
        hardwareEnabled: {
          ...stateManager.getState().hardwareEnabled,
          ...{ microphone: false },
        },
      });
      // setAvatar({ audioMuted: true });
      this.audioProducer?.replaceTrack({ track: null });
    } else if (
      mediaStreams?.audioTrack &&
      typeof mediaStreams.audioTrack !== "boolean" &&
      mediaStreams.audioTrack.kind === "audio"
    ) {
      // TODO hack this will fix it for now need to rewrite mediaDevice manager
      if (this.audioProducer !== undefined) {
        this.audioProducer?.close();
      }
      if (this.audioProduced === false) {
        if (!this.producerTransport) {
          console.debug("there is no audio producer transport round!");
          return;
        }
        this.audioProduced = true;
        this.producerTransport
          .produce({
            track: mediaStreams.audioTrack,
            appData: {
              source: "microphone",
              deviceId: mediaStreams.audioTrack.getSettings().deviceId,
            },
          })
          .then((audioProducer) => {
            this.audioProducer = audioProducer;
            stateManager.setState({
              hardwareEnabled: {
                ...stateManager.getState().hardwareEnabled,
                ...{ microphone: true },
              },
            });
            this.audioProduced = false;
            setAvatar({ audioMuted: false });
          });
        console.debug("producing audio now!");
      } else {
        console.debug("audio already been produced!");
      }
    } else {
      console.debug("Mediastream for audio gave an unknown value");
    }

    //Create Video producer, if present
    if (mediaStreams?.videoTrack === undefined) {
      console.debug(
        "Video track is undefined, no action taken.",
        mediaStreams?.videoTrack
      );
    } else if (mediaStreams.videoTrack === false) {
      //Remove media from avatar sending
      console.debug("Stopping video stream locally");
      stateManager.setState({
        hardwareEnabled: {
          ...stateManager.getState().hardwareEnabled,
          ...{ camera: false },
        },
      });
      if (this.videoProducer && this.videoProducerId) {
        // this.videoProducer.replaceTrack({ track: null });
        this.videoProducer.track?.stop();
        this.videoProducer.close();
        this.send("producerClose", {
          peerId: this.avatar_id,
          producerId: this.videoProducerId,
          mediaType: "webCam",
        });
        delete this.videoProducer;
      }
    } else if (
      mediaStreams?.videoTrack &&
      typeof mediaStreams.videoTrack !== "boolean" &&
      mediaStreams.videoTrack.kind === "video"
    ) {
      console.log("Producing video track", mediaStreams.videoTrack.id);
      if (!this.producerTransport) {
        console.debug("there is no video producerTransport");
        return;
      }
      this.producerTransport
        .produce({
          track: mediaStreams.videoTrack,
          appData: {
            source: "webcam",
          },
        })
        .then((videoProducer) => {
          this.videoProducer = videoProducer;
          stateManager.setState({
            hardwareEnabled: {
              ...stateManager.getState().hardwareEnabled,
              ...{ camera: true },
            },
          });
          // Ensure that streaming screen is reverted to normal when this track stops
          if (
            mediaStreams?.videoTrack &&
            typeof mediaStreams.videoTrack !== "boolean" &&
            mediaStreams.videoTrack instanceof MediaStreamTrack
          ) {
            mediaStreams.videoTrack.addEventListener("ended", () => {
              setBoundAssets(
                stateManager
                  .getState()
                  .boundAssets.filter(
                    (n) => !isStreamingScreen(n) || n.source !== "webcam"
                  )
              );
              setAvatar({ videoPanelEnabled: false });
            });
          } else {
            console.debug("there is no media stream to listen to");
          }
        });
    } else {
      console.error("Mediastream for video gave an unknown value");
    }

    return;
  }

  // stop producer for mediasouce
  async stopMediaSource(
    deviceType: string,
    mediaStream: {
      audioTrack: { getTracks: () => any[] };
      videoTrack: { stop: () => void };
    },
    isLobby: any
  ) {
    if (deviceType === "audio") {
      mediaStream.audioTrack
        ?.getTracks()
        .forEach(
          (track: { readyState: string; kind: string; stop: () => void }) => {
            if (track.readyState == "live" && track.kind === "audio") {
              track.stop();
            }
          }
        );
      this.audioProducer?.replaceTrack({ track: null });
    } else if (deviceType === "video") {
      if (mediaStream.videoTrack) {
        const localVideoElement: HTMLMediaElement | null =
          document.querySelector(
            '[data-localVideo="local"][data-mediaSource="webcam"]'
          );
        if (localVideoElement && localVideoElement.srcObject) {
          const mediaStream: MediaStream = <MediaStream>(
            localVideoElement.srcObject
          );
          if (mediaStream) {
            mediaStream.getTracks().forEach((t) => t.stop());
          }
        }
        mediaStream.videoTrack.stop();
      }
      if (!isLobby) {
        this.videoProducer?.replaceTrack({ track: null });
      }
    }
  }

  // Change mediasource and replace track for mediasoup
  async changeMediaSource(
    mediaStream: MediaStreamTrack,
    muteState: any,
    isLobby: any
  ) {
    if (mediaStream.kind === "audio") {
      if (!isLobby) {
        this.audioProducer?.replaceTrack({ track: mediaStream });
      }
      if (muteState && !isLobby) {
        await this.audioProducer?.pause();
      }
    } else if (mediaStream.kind === "video") {
      const localVideoElement: HTMLMediaElement | null = document.querySelector(
        '[data-localVideo="local"][data-mediaSource="webcam"]'
      );
      if (localVideoElement?.srcObject) {
        const old_mediaStream: MediaStream = <MediaStream>(
          localVideoElement.srcObject
        );
        if (old_mediaStream) {
          old_mediaStream.getAudioTracks().forEach((t) => t.stop());
        }
        localVideoElement.srcObject = new MediaStream([mediaStream]);
        localVideoElement.play();
      }
      if (!isLobby) {
        this.videoProducer?.replaceTrack({ track: mediaStream });
      }
      if (muteState && !isLobby) {
        await this.videoProducer?.pause();
      }
    }
  }

  async changeScreenMediaSource(mediaStream: { kind: string; track: any }) {
    if (mediaStream.kind === "audio") {
      this.audioProducer?.replaceTrack({ track: mediaStream.track });
    } else if (mediaStream.kind === "video") {
      this.videoProducer?.replaceTrack({ track: mediaStream.track });
    }
  }

  /**
   *  Add local screen media tracks to avatar, for relay to peer avatars
   *  this sends data across the network to the media servers
   *   - if the media is undefined, do not act on it
   *   - if the media is false, remove it from sending
   *   - if the media is a track, add it to the sending
   *  @todo make this one happy function with addMedia
   *  @public
   *  @param mediaStreams - Streams returned by requestMedia() for sending to other remote avatars
   **/
  async addScreenMedia(mediaStreams: {
    audioTrack: MediaStreamTrack | boolean | undefined;
    videoTrack: MediaStreamTrack | boolean | undefined;
    deviceId: string | number;
  }) {
    //Create Audio producer, if present
    if (mediaStreams.audioTrack === undefined) {
      console.debug(
        "Display screen audio track is undefined, no action taken.",
        mediaStreams.audioTrack
      );
    } else if (mediaStreams.audioTrack === false) {
      //Remove media from avatar sending
      console.log("Stopping display screen audio stream locally");
      stateManager.setState({
        hardwareEnabled: {
          ...stateManager.getState().hardwareEnabled,
          ...{ screenAudio: false },
        },
      });
      //stateManager.setState( { avatar: { ...stateManager.getState().avatar, ...{audioMuted: true} } } )
      //this.audioProducer.close()
      //this.audioProducer.pause()
      // this.screenAudioProducer[mediaStreams.deviceId]?.replaceTrack({
      //   track: null
      // });
      this.screenAudioProducer[mediaStreams.deviceId].close();
      this.send("producerClose", {
        peerId: this.avatar_id,
        producerId: this.screenAudioProducerIds[mediaStreams.deviceId],
        mediaType: "screenAudio",
      });
      delete this.screenAudioProducer[mediaStreams.deviceId];
    } else if (
      mediaStreams?.audioTrack &&
      typeof mediaStreams.audioTrack !== "boolean" &&
      mediaStreams.audioTrack.kind === "audio"
    ) {
      if (!this.producerTransport) {
        console.debug("cannot find producerTransport Audio");
        return;
      }
      this.producerTransport
        .produce({
          track: mediaStreams.audioTrack,
          appData: {
            source: "screenAudio",
            deviceId: mediaStreams.audioTrack.getSettings().deviceId,
          },
        })
        .then((screenAudioProducer) => {
          if (
            mediaStreams?.audioTrack &&
            typeof mediaStreams.audioTrack !== "boolean" &&
            mediaStreams.audioTrack instanceof MediaStreamTrack
          ) {
            const deviceId = mediaStreams.audioTrack.getSettings().deviceId;
            if (!deviceId) {
              console.debug("no deviceId for audio");
              return;
            }
            this.screenAudioProducer[deviceId] = screenAudioProducer;
            stateManager.setState({
              hardwareEnabled: {
                ...stateManager.getState().hardwareEnabled,
                ...{ screenAudio: true },
              },
            });
            // Ensure that streaming screen is reverted to normal when this track stops
            mediaStreams.audioTrack.addEventListener("ended", () => {
              if (typeof mediaStreams.audioTrack !== "boolean") {
                const deviceId =
                  mediaStreams.audioTrack?.getSettings().deviceId;
                setBoundAssets(
                  stateManager.getState().boundAssets.filter(
                    (n) =>
                      n.type !== undefined || // allow non-streaming screen bindings
                      (n.deviceId !== deviceId && n.source !== "screenAudio")
                  )
                );
              }
            });
          }
        });
    } else {
      console.error("Mediastream for audio gave an unknown value");
    }

    //Create Video producer, if present
    if (mediaStreams.videoTrack === undefined) {
      console.debug(
        "Video track is undefined, no action taken.",
        mediaStreams.videoTrack
      );
    } else if (mediaStreams.videoTrack === false) {
      //Remove media from avatar sending
      console.log("Stopping screen video stream locally");
      stateManager.setState({
        hardwareEnabled: {
          ...stateManager.getState().hardwareEnabled,
          ...{ screenVideo: false },
        },
      });
      //this.videoProducer.pause()
      //this.videoProducer.close()
      if (this.screenVideoProducer[mediaStreams.deviceId]) {
        this.screenVideoProducer[mediaStreams.deviceId].close();
        this.send("producerClose", {
          peerId: this.avatar_id,
          producerId: this.screenVideoProducerIds[mediaStreams.deviceId],
          mediaType: "screenVideo",
        });
        delete this.screenVideoProducer[mediaStreams.deviceId];
        //this.screenVideoProducer.replaceTrack({ track: null });
      }
    } else if (
      mediaStreams?.videoTrack &&
      typeof mediaStreams.videoTrack !== "boolean" &&
      mediaStreams.videoTrack.kind === "video"
    ) {
      if (!this.producerTransport) {
        console.debug("there is no producer Transport for Video");
        return;
      }
      this.producerTransport
        .produce({
          track: mediaStreams.videoTrack,
          appData: {
            source: "screenVideo",
            deviceId: mediaStreams.videoTrack.getSettings().deviceId,
          },
        })
        .then((screenVideoProducer) => {
          if (
            mediaStreams.videoTrack &&
            typeof mediaStreams.videoTrack !== "boolean"
          ) {
            const deviceId = mediaStreams.videoTrack.getSettings().deviceId;
            if (!deviceId) {
              console.debug("no deviceId found in screenVideoProducer");
              return;
            }
            this.screenVideoProducer[deviceId] = screenVideoProducer;
            stateManager.setState({
              hardwareEnabled: {
                ...stateManager.getState().hardwareEnabled,
                ...{ screenVideo: true },
              },
            });
            // Ensure that streaming screen is reverted to normal when this track stops
            mediaStreams.videoTrack.addEventListener("ended", () => {
              setBoundAssets(
                (
                  stateManager.getState()
                    .boundAssets as unknown as BoundAssetStreamingScreen[]
                ).filter(
                  (n) => n.deviceId !== deviceId && n.source !== "screenVideo"
                )
              );
            });
          }
        });
    } else {
      console.error("Mediastream for screen video gave an unknown value");
    }

    return;
  }

  /**
   *  Set the local media state, by the following values
   *   - if the media is undefined, do not act on it
   *   - if the media is false, pause sending
   *   - if the media is true, resume sending
   *  @todo make this used more or better... this needs work.
   *  @public
   *  @param mediaStreams - Streams status to be set, audioTrack and videoTrack keys, values are boolean
   **/
  async setMediaState(mediaStreams: {
    audioTrack: boolean | undefined;
    videoTrack: boolean | undefined;
  }) {
    //Create Audio producer, if present
    if (mediaStreams.audioTrack === undefined) {
      console.debug(
        "Audio track is undefined, no action taken.",
        mediaStreams.audioTrack
      );
    } else if (mediaStreams.audioTrack === false) {
      console.debug(
        "Pausing audio producer locally",
        this.avatar_id,
        "producer id: ",
        this.audioProducerId
      );
      stateManager.setState({
        hardwareEnabled: {
          ...stateManager.getState().hardwareEnabled,
          ...{ microphone: false },
        },
      });
      if (this.audioProducer && this.audioProducerId) {
        this.send("muteProducer", {
          peerId: this.avatar_id,
          producerId: this.audioProducerId,
          kind: this.audioProducer.kind,
        });
        await this.audioProducer.pause();
      }
    } else if (mediaStreams.audioTrack === true) {
      console.debug(
        "Unpause audio producer locally",
        this.avatar_id,
        "producer id: ",
        this.audioProducerId
      );
      stateManager.setState({
        hardwareEnabled: {
          ...stateManager.getState().hardwareEnabled,
          ...{ microphone: true },
        },
      });
      if (this.audioProducer && this.audioProducerId) {
        this.send("resumeProducer", {
          peerId: this.avatar_id,
          producerId: this.audioProducerId,
          kind: this.audioProducer.kind,
        });
        this.audioProducer.resume();
      }
    } else {
      console.error("Mediastream for audio gave an unknown value");
    }
    setAvatar({
      audioMuted: this.audioProducer ? this.audioProducer.paused : false,
    });
    //Create Video producer, if present
    // some of this can be moved to the onpause of the producer
    if (mediaStreams.videoTrack === undefined) {
      console.debug(
        "Video track is undefined, no action taken.",
        mediaStreams.videoTrack
      );
    } else if (mediaStreams.videoTrack === false) {
      //Remove media from avatar sending
      console.debug("Pausing video stream locally");
      stateManager.setState({
        hardwareEnabled: {
          ...stateManager.getState().hardwareEnabled,
          ...{ camera: false },
        },
      });
      if (!this.videoProducer) {
        console.debug("no video producer found!");
        return;
      }
      await this.videoProducer.pause();
      //this.videoProducer.close()
      //this.videoProducer.replaceTrack( {track: null} );
    } else if (mediaStreams.videoTrack === true) {
      console.debug("Unpausing video track");
      stateManager.setState({
        hardwareEnabled: {
          ...stateManager.getState().hardwareEnabled,
          ...{ camera: true },
        },
      });
      this.videoProducer?.resume();
    } else {
      console.error("Mediastream for video gave an unknown value");
    }
  }

  /**
   * Sends a Websocket signaling message
   * @param type - Type of message signaling is carrying
   * @param message - Payload of the message of given type
   */
  send<T extends TypeOfRequestMessage>(
    type: T,
    message: RequestMessageType<T>
  ) {
    if (this.websocketReady()) {
      console.debug("Avatar outbound signal:", type, message);
      this.signalTransport?.send(JSON.stringify({ type, message }));
    }
  }

  // Callback handlers -----------------------------------------------------------------------------------

  /**
   *  Provide ICE credentials when avatar attempts to make a WebRTC connection
   *  @method avatar~setICEH`andler
   *  @public
   *  @param {avatarHarness~iceHandler} func - The callback that handles the response.
   **/
  setICEHandler(func: () => Promise<any[]>) {
    this.iceHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives an identity from the signaling server
   *  @method avatar~setIdentityHandler
   *  @public
   *  @param {avatarHarness~identityHandler} func - The callback that handles the response.
   **/
  setIdentityHandler(func: CallBackHandler) {
    this.identityHandler = func;
  }

  /**
   *  Provide actions to take when a remote peer sends their peerIndicators to the local client
   *  @public
   *  @param {avatarHarness~peerIndicatorsHandler} func - The callback that handles the response.
   **/
  setPeerIndicatorsHandler(func: IndicatorCallBackHandler) {
    this.peerIndicatorsHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives a remote peer's audio data
   *  @method avatar~setAudioHandler
   *  @public
   *  @param {avatarHarness~audioHandler} func - The callback that handles the response.
   **/
  setAudioHandler(func: MediaCallBackHandler) {
    this.peerAudioHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives a pause/resume for a peer's audio
   *  @method avatar~setAudioStateHandler
   *  @public
   *  @param {avatarHarness~peerAudioStateHandler} func - The callback that handles the response.
   **/
  setAudioStateHandler(func: StateCallBackHandler) {
    this.peerAudioStateHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives a remote peer's video data
   *  @method avatar~setVideoHandler
   *  @public
   *  @param {avatarHarness~videoHandler} func - The callback that handles the response.
   **/
  setVideoHandler(func: MediaCallBackHandler): void {
    this.peerVideoHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives a pause/resume for a peer's video
   *  @method avatar~setVideoStateHandler
   *  @public
   *  @param {avatarHarness~peerVideoStateHandler} func - The callback that handles the response.
   **/
  setVideoStateHandler(func: StateCallBackHandler) {
    this.peerVideoStateHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives a remote peer's movement data
   *  @method avatar~setMovementHandler
   *  @public
   *  @param {avatarHarness~movementHandler} func - The callback that handles the response.
   **/
  setMovementHandler(func: MovementCallBackHandler) {
    this.peerMovementHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives a remote peer's childobject data
   *  @method avatar~setChildrenHandler
   *  @todo Decide if this is needed
   *  @public
   *  @param {avatarHarness~childrenHandler} func - The callback that handles the response.
   **/
  setChildrenHandler(func: CallBackHandler) {
    this.peerChildrenHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives a remote peer's disconnect notice
   *  @method avatar~setDisconnectHandler
   *  @public
   *  @param {avatarHarness~peerDisconnectHandler} func - The callback that handles the response.
   **/
  setPeerDisconnectHandler(func: CallBackHandler) {
    this.peerDisconnectHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives an instructon to mute an avatar
   *  @method avatar~setPeerMuteHandler
   *  @public
   *  @param {avatarHarness~peerMuteHandler} func - The callback that handles the response.
   **/
  setPeerMuteHandler(func: CallBackHandler) {
    this.peerMuteHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives a signal that it has been hushed
   *  @method avatar~setHushedHandler
   *  @public
   *  @param {avatarHarness~hushedHandler} func - The callback that handles the response.
   **/
  setHushedHandler(func: CallBackHandler) {
    this.hushedHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives a peer count signal
   *  @method avatar~setPeerCountHandler
   *  @public
   *  @param {avatarHarness~peerCountHandler} func - The callback that handles the response.
   **/
  setPeerCountHandler(func: PeerCallBackHandler) {
    this.peerCountHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives a signal that it is entering
   *  @method avatar~setEnterHandler
   *  @public
   *  @param {avatarHarness~enterHandler} func - The callback that handles the response.
   **/
  setEnterHandler(func: EnterCallBackHandler) {
    this.enterHandler = func;
  }

  /**
   *  Provide actions to take when the avatar receives a signal that it is leaving
   *  @method avatar~setLeaveHandler
   *  @public
   *  @param {avatarHarness~leaveHandler} func - The callback that handles the response.
   **/
  setLeaveHandler(func: LeaveCallBackHandler) {
    this.leaveHandler = func;
  }

  // Avatar actions --------------------------------------------------------------------------------------

  /**
   *  Mute local avatar for everyone and self
   *  Pauses producer on server, and sends {audioMuted:true} indicators to other peers
   *  @public
   **/
  // this don't seems to be in use i will comment this out for now, will remove in future
  // muteSelf(mute) {
  //   this.send("mutePeer", { peerId: this.avatar_id, mute: mute });
  // }

  /**
   *  Mute a local consumer of audio
   *  this mutes the peer audio for only the local avatar
   *  dont indicate to other peers
   *  @public
   **/
  mutePeer(mute: boolean, peerId: string | number) {
    //Return if no audio consumer

    this.audioConsumerState[peerId] = mute;
    if (!this.audioConsumers[peerId]) {
      return false;
    }
    const audioConsumer = this.audioConsumers[peerId];
    // mute local consumer
    if (mute) {
      audioConsumer.pause();
      console.log("Muted Peer", peerId);
    } else {
      audioConsumer.resume();
      console.log("Unmuted Peer", peerId);
    }
  }

  // this is for private streamingScreen
  mutePeerScreen(mute: any, peerId: string | number, consumerId: any) {
    //Return if no audio consumer

    if (!this.screenVideoConsumers[peerId]) {
      return false;
    }
    if (mute) {
      this.screenVideoConsumers[peerId].forEach(
        (consumer: { id: any; pause: () => void }) => {
          if (consumer.id === consumerId) {
            consumer.pause();
          } else {
            consumer.pause();
          }
        }
      );
      console.log("Muted Peer screen video", peerId);
    } else {
      this.screenVideoConsumers[peerId].forEach(
        (consumer: { id: any; resume: () => void }) => {
          if (consumer.id === consumerId) {
            consumer.resume();
          } else {
            consumer.resume();
          }
        }
      );
      console.log("Unmuted Peer screen video", peerId);
    }
  }

  mutePeerScreenAudio(mute: any, peerId: string | number, consumerId: any) {
    //Return if no audio consumer
    if (!this.screenAudioConsumers[peerId]) {
      return false;
    }
    if (mute) {
      console.log("muting screen audio: ", consumerId);
      this.screenAudioConsumers[peerId].forEach(
        (consumer: { id: any; pause: () => void }) => {
          if (consumer.id === consumerId) {
            consumer.pause();
          } else {
            consumer.pause();
          }
        }
      );
    } else {
      console.log("unmuting screen audio: ", consumerId);
      this.screenAudioConsumers[peerId].forEach(
        (consumer: { id: any; resume: () => void }) => {
          if (consumer.id === consumerId) {
            consumer.resume();
          } else {
            consumer.resume();
          }
        }
      );
    }
  }

  /**
   *  Mute everyone in the room (except the husher)
   *  Pauses producers on servers, and sends {audioMuted:true} messages to all peers
   *  peers may umute normally after this
   *  @public
   **/
  hushPeers() {
    this.send("hushPeers", { peerId: this.avatar_id });
  }

  /**
   * Kick a user out of the room
   * @param  {string} peerId ID of peer to boot
   * @param  {string} auth unused placeholder
   * @public
   */
  bootUser(peerId: any, _auth: any) {
    this.send("bootPeer", { peerId });
  }

  /**
   *  Set function that is called on specified event name
   *  @method avatar~setFrameEventsHandler
   *  @public
   *  @param {avatarHarness~removeFrameEventsHandler} eventName - The event name
   *  @param {avatarHarness~setFrameEventsHandler} func - The function to run when the event is received
   **/
  setFrameEventsHandler(eventName: string | number, func: EventHandler) {
    // Create array object if undefined
    if (!this.frameEventsHandler[eventName]) {
      this.frameEventsHandler[eventName] = [];
    }
    this.frameEventsHandler[eventName].push(func);
  }

  /**
   *  Remove function that is called on specified event name
   *  @method avatar~removeFrameEventsHandler
   *  @public
   *  @param {avatarHarness~removeFrameEventsHandler} eventName - The event name
   *  @param {avatarHarness~removeFrameEventsHandler} func - The function to remove
   **/
  removeFrameEventsHandler(eventName: string | number, func: any) {
    if (!this.frameEventsHandler[eventName]) {
      return;
    }
    const funcIndex = this.frameEventsHandler[eventName].indexOf(func);
    if (funcIndex !== -1) {
      this.frameEventsHandler[eventName].splice(funcIndex, 1);
    }
    if (this.frameEventsHandler[eventName].length === 0) {
      delete this.frameEventsHandler[eventName];
    }
  }

  /**
   *  Test the validitiy (open state) of the datachannel for sending
   *  @method avatar~dataChannel
   *  @public
   *  @param {string} label - The label of the datachannel to check.
   **/
  dataChannel(label: string) {
    if (
      label === "AvatarMovement" &&
      this.movementProducer &&
      this.movementProducer.readyState === "open"
    ) {
      return this.movementProducer;
    } else if (
      label === "FrameEvents" &&
      this.frameEventsProducer &&
      this.frameEventsProducer.readyState === "open"
    ) {
      return this.frameEventsProducer;
    }

    // Return false if no label is available
    console.warn("Data channel is not open yet", label);
    return false;
  }

  /**
   *  Takes incoming signals and invokes their payloads based on types.
   *  Determines the signal's type and then invokes avatar functions
   *  Some of these may call the callback handlers
   *  @todo clean this up message.message.signal.data.type crap
   *  @public
   *  @param {string} message - The incoming message signal
   **/
  async incomingSignal(message: { data: string }) {
    let signal: CommunicationResponse;
    try {
      const data = JSON.parse(message.data);
      signal = data;
      console.debug("Avatarlink Inbound signal:", signal);
      // Unless the avatar is currently in a room, ignore these signals

      if (signal.type === "identity") {
        this.avatar_id = signal.data.id;
        this.identityHandler?.(this.avatar_id);
      } else if (signal.type === "joinedRoom") {
        if (!this.webRTCDevice.loaded && signal.data.roomRTPCapabilities) {
          await this.webRTCDevice.load({
            routerRtpCapabilities: signal.data.roomRTPCapabilities,
          });
        }

        //Request creating ingress transport
        if (signal.data.ingress) {
          this.send("createIngressTransport", {
            peerId: this.avatar_id,
            numStreams: this.webRTCDevice.sctpCapabilities.numStreams,
            rtpCapabilities: this.webRTCDevice.rtpCapabilities,
          });
        }

        //Request creating egress transport
        if (signal.data.egress) {
          this.send("createEgressTransport", {
            peerId: this.avatar_id,
            numStreams: this.webRTCDevice.sctpCapabilities.numStreams,
            rtpCapabilities: this.webRTCDevice.rtpCapabilities,
            egress: signal.data.egress,
          });
        }
        //Requst creating movement server, if signaling says movment plugin is used
        if (signal.data.movement) {
          this.connectRegionalMovementServer(signal.data.serverInfo);
        }
        this.consumerConnected = true;
      } else if (signal.type === "createdIngressTransport") {
        this.connectIngressTransport(signal.data);
      } else if (signal.type === "createdEgressTransport") {
        this.connectEgressTransport(signal.data);
      } else if (signal.type === "connectedIngressTransport") {
        //this.connectedIngressTransport(signal.data);
        console.debug("Avatarlink: Ingress transport connected.");
      } else if (signal.type === "connectedEgressTransport") {
        //this.connectedEgressTransport(signal.data);
        console.debug("Avatarlink: Egress transport connected.");
      } else if (signal.type === "audioAnnouncement") {
        //Do not accept audio announcements if in lobby or not able to consume
        if (stateManager.getState().avatar.lobby) {
          console.debug(
            "Unable to recieve peer audio data. Avatar is in the lobby, or consumer transport is not open."
          );
          return;
        }
        await waitFor(() => this.consumerConnected === true);
        //Unwrap object by producer peers,
        for (const producerPeer in signal.data) {
          const audioProducers = signal.data[producerPeer];
          for (let i = 0; i < audioProducers.length; i++) {
            try {
              await waitFor(
                () =>
                  this.consumerTransport[audioProducers[i].transportId] !==
                  undefined
              );
              await this.consumerTransport[audioProducers[i].transportId]
                .consume(audioProducers[i])
                .then((newConsumer) => {
                  if (newConsumer.appData.source === "microphone") {
                    this.audioConsumers[producerPeer] = newConsumer; //Save consumer for later , only the microphone one because thats the one that needs to be paused/resumed later on
                    if (this.audioConsumerState[producerPeer] === true) {
                      this.audioConsumers[producerPeer].pause();
                    }
                  }
                  if (newConsumer.appData.source === "screenAudio") {
                    if (!this.screenAudioConsumers[producerPeer]) {
                      this.screenAudioConsumers[producerPeer] = [];
                    }
                    this.screenAudioConsumers[producerPeer].push(newConsumer); //Save consumer for later , only the microphone one because thats the one that needs to be paused/resumed later on
                  }
                  this.peerAudioHandler?.(
                    producerPeer,
                    newConsumer.track,
                    newConsumer.appData
                  ); //Give audio to peer
                });
            } catch (error) {
              console.error(
                "Error creating audio consumer from audio announcement:",
                error
              );
            }
          }
        }
      } else if (signal.type === "videoAnnouncement") {
        //Do not accept video announcements if in lobby or not able to consume
        if (stateManager.getState().avatar.lobby) {
          console.debug(
            "Unable to recieve peer video data. Avatar is in the lobby, or consumer transport is not open."
          );
          return;
        }
        await waitFor(() => this.consumerConnected === true);
        for (const producerPeer in signal.data) {
          const videoProducers = signal.data[producerPeer];
          for (let i = 0; i < videoProducers.length; i++) {
            try {
              await waitFor(
                () =>
                  this.consumerTransport[videoProducers[i].transportId] !==
                  undefined
              );
              await this.consumerTransport[videoProducers[i].transportId]
                .consume(videoProducers[i])
                .then((newConsumer) => {
                  if (newConsumer.appData.source === "webcam") {
                    this.videoConsumers[producerPeer] = newConsumer; //Save consumer for later
                  }
                  if (newConsumer.appData.source === "screenVideo") {
                    if (!this.screenVideoConsumers[producerPeer]) {
                      this.screenVideoConsumers[producerPeer] = [];
                    }
                    this.screenVideoConsumers[producerPeer].push(newConsumer); //Save consumer for later
                  }
                  this.peerVideoHandler?.(
                    producerPeer,
                    newConsumer.track,
                    newConsumer.appData
                  ); //Give audio to peer
                  newConsumer.on("trackended", () => {
                    console.debug(
                      "This will work entually, when browsers sort our their spec"
                    );
                  });
                });
            } catch (error) {
              console.error(
                "Error creating video consumer from audio announcement:",
                error
              );
            }
          }
        }
      } else if (signal.type === "movementAnnouncement") {
        if (stateManager.getState().avatar.lobby) {
          console.debug(
            "Unable to recieve peer movement data. Avatar is in the lobby, or consumer transport is not open."
          );
          return;
        }
        await waitFor(() => this.consumerConnected === true);
        for (const producerPeer in signal.data) {
          const movementProducer = signal.data[producerPeer];
          //Containing one or two sets of options
          try {
            await waitFor(
              () =>
                this.consumerTransport[movementProducer.transportId] !==
                undefined
            );
            await this.consumerTransport[movementProducer.transportId]
              .consumeData(movementProducer)
              .then((newMovementConsumer) => {
                newMovementConsumer.peerId = producerPeer;
                if (Array.isArray(this.movementConsumers[producerPeer])) {
                  this.movementConsumers[producerPeer].push(
                    newMovementConsumer
                  );
                } else {
                  this.movementConsumers[producerPeer] = [newMovementConsumer];
                }
                newMovementConsumer.binaryType = "arraybuffer";
                newMovementConsumer.on("open", () => {
                  if (signal.type === "movementAnnouncement") {
                    console.log(
                      `Movement channel opened for ${producerPeer}`,
                      signal.data[producerPeer]
                    );
                  }
                });
                newMovementConsumer.on("close", () => {
                  if (signal.type === "movementAnnouncement") {
                    console.log(
                      `Movement channel closed for ${producerPeer}`,
                      signal.data[producerPeer]
                    );
                  }
                });
                newMovementConsumer.on("error", (err) => {
                  console.error(
                    "The consumer appData: ",
                    newMovementConsumer.appData,
                    "isClosed",
                    newMovementConsumer.closed
                  );
                  if (signal.type === "movementAnnouncement") {
                    console.error(
                      "The consumer Transport connection state: ",
                      this.consumerTransport[
                        signal.data[producerPeer].transportId
                      ].connectionState
                    );
                  }
                  console.error("Error on movement channel:", err);
                });
                newMovementConsumer.on("message", (data) => {
                  try {
                    this.peerMovementHandler?.(
                      movementToJSON(data),
                      producerPeer
                    );
                  } catch (err) {
                    console.error(
                      `Can not JSON.parse Frame movement data ${err}. Blob content: ${data}`
                    );
                  }
                });
              });
          } catch (error) {
            console.error(
              "Error creating movement consumer from movement announcement:",
              error
            );
          }
        }
      } else if (signal.type === "eventAnnouncement") {
        await waitFor(() => this.consumerConnected === true);
        for (const producerPeer in signal.data) {
          const eventProducer = signal.data[producerPeer];
          //Containing one or two sets of options
          try {
            await waitFor(
              () =>
                this.consumerTransport[eventProducer.transportId] !== undefined
            );
            await this.consumerTransport[eventProducer.transportId]
              .consumeData(eventProducer)
              .then((newFrameEventsConsumer) => {
                newFrameEventsConsumer.peerId = producerPeer;
                if (Array.isArray(this.frameEventsConsumers[producerPeer])) {
                  this.frameEventsConsumers[producerPeer].push(
                    newFrameEventsConsumer
                  );
                } else {
                  this.frameEventsConsumers[producerPeer] = [
                    newFrameEventsConsumer,
                  ];
                }

                newFrameEventsConsumer.on("open", () => {
                  if (signal.type === "eventAnnouncement") {
                    console.log(
                      `Event channel opened for ${producerPeer}`,
                      signal.data[producerPeer]
                    );
                  }
                });
                newFrameEventsConsumer.on("close", () => {
                  if (signal.type === "eventAnnouncement") {
                    console.log(
                      `Event channel closed for ${producerPeer}`,
                      signal.data[producerPeer]
                    );
                  }
                });
                newFrameEventsConsumer.on("error", (err) => {
                  console.error("Error on Frame Events channel:", err);
                });
                newFrameEventsConsumer.on("message", (data) => {
                  //Execute any stored functions that are associated to this type of event
                  try {
                    const message = JSON.parse(data);
                    if (message.type in this.frameEventsHandler) {
                      const eventCallback =
                        this.frameEventsHandler[message.type];
                      eventCallback.forEach((callback: (arg0: any) => void) => {
                        callback(message);
                      });
                    } else {
                      console.warn("Received unknown Frame Event!", message);
                    }
                  } catch (err) {
                    if (signal.type === "eventAnnouncement") {
                      console.error(
                        `Can not JSON.parse Frame event data ${err}. Blob content: ${JSON.stringify(
                          data
                        )} in ${JSON.stringify(signal.data[producerPeer])}`
                      );
                    }
                  }
                });
              });
          } catch (error) {
            console.error(
              "Error creating event consumer from event announcement:",
              error
            );
          }
        }
      } else if (signal.type === "producedMedia") {
        if (signal.data.appData.source === "microphone") {
          this.audioProducerId = signal.data.id;
        } else if (signal.data.appData.source === "webcam") {
          this.videoProducerId = signal.data.id;
        } else if (signal.data.appData.source === "screenVideo") {
          this.screenVideoProducerIds[signal.data.appData.deviceId as string] =
            signal.data.id;
        } else if (signal.data.appData.source === "screenAudio") {
          this.screenAudioProducerIds[signal.data.appData.deviceId as string] =
            signal.data.id;
        }
      } else if (signal.type === "producedData") {
        this.movementProducerId = signal.data.dataProducerId;
      } else if (signal.type === "producedEvents") {
        this.frameEventsProducerId = signal.data.dataProducerId;
      } else if (signal.type === "peerDisconnect") {
        // Also disconnects the all of the peer's consumers,
        // although this could be handled by the media server
        this.closeConsumersForPeer(signal.data.peer);
        this.peerDisconnectHandler?.(signal.data.peer);
      } else if (signal.type === "setConsumerState") {
        //Signal that a peer's media/data has paused
        if (signal.data.type === "audio") {
          this.peerAudioStateHandler?.(
            signal.data.peerId,
            signal.data.state,
            signal.data.type
          );
        }
        if (signal.data.type === "video") {
          this.peerVideoStateHandler?.(
            signal.data.peerId,
            signal.data.state,
            signal.data.type
          );
        }
      } else if (signal.type === "hushed") {
        this.hushedHandler?.(signal.data.peerId);
      } else if (signal.type === "peerIndicators") {
        // Received indicators for an existing peer
        this.peerIndicatorsHandler?.(
          signal.data.peerId,
          signal.data.indicators,
          true
        );
      } else if (signal.type === "peerIndicatorsReply") {
        // Received indicators for an existing peer
        this.peerIndicatorsHandler?.(
          signal.data.peerId,
          signal.data.indicators,
          false
        );
      } else if (signal.type === "peerLagScore") {
        console.debug("Quality Score Change:", signal.data);
      } else if (signal.type === "peerCount") {
        //Deconstruct peer counts and send them individually to the handler
        for (const roomName in signal.data) {
          this.peerCountHandler?.(roomName, signal.data[roomName]);
        }
      } else if (signal.type === "bootUser") {
        window.location.href = "/";
      } else if (signal.type === "producerResume") {
        console.debug("producerResumed");
      } else if (signal.type === "producerPaused") {
        console.debug("producerPaused");
      } else if (signal.type === "restartedIce") {
        console.debug("restarted ice");
      } else {
        console.warn("Got unexpected signal from avatar server", signal);
      }
    } catch (err) {
      console.error("Can not JSON.parse data", err, message);
    }
  }

  /**
   *  Creates a sending transport (ingress) from the client to the mediaserver.
   *  Setup the signals to send to the api when produce is called on this transport
   *  @public
   *  @param {Object} transport - Peer transport
   */
  async connectIngressTransport(transport) {
    //Create
    this.producerTransport = await this.webRTCDevice.createSendTransport({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      iceServers: (await this.iceHandler()) || [],
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    });
    this.producerConnected = true;
    this.producerTransport.on(
      "connect",
      async ({ dtlsParameters }, callback) => {
        this.send("connectIngressTransport", {
          peerId: this.avatar_id,
          direction: this.producerTransport?.direction,
          dtlsParameters: dtlsParameters,
        });
        callback();
      }
    );
    this.producerTransport.on("connectionstatechange", (connectionState) => {
      console.warn("Producer transport state:", connectionState);
      if (connectionState === "connected") {
        console.log("Producer transport connected");
      } else if (connectionState === "failed") {
        console.error("Producer transport connection state FAILED");
        // Previous attempts to reconnect ICE were here, but we got nervous about it and took it out for now.
        const actionText = `Please refresh. Email ${branding.support} for additional help`;
        stateManager.getState().addNotification({
          dismissable: true,
          text: `Oops! Sending to server has been disrupted. ${actionText}.`,
        });
        this.producerConnected = false;
      }
    });

    this.producerTransport.on(
      "produce",
      async ({ kind, rtpParameters, appData }, callback) => {
        // Send producer data to server
        this.send("produceMedia", {
          producingPeer: this.avatar_id,
          producerOptions: {
            kind: kind,
            rtpParameters: rtpParameters,
            appData: appData,
          } as ProducerMediaOpts,
        });
        if (appData.source === "webcam") {
          await waitFor(() => this.videoProducerId !== undefined);
          if (this.videoProducerId) {
            callback({ id: this.videoProducerId });
          }
        } else if (appData.source === "microphone") {
          await waitFor(() => this.audioProducerId !== undefined);
          if (this.audioProducerId) {
            callback({ id: this.audioProducerId });
          }
        } else if (appData.source === "screenVideo") {
          const deviceId = appData.deviceId as string;
          await waitFor(() =>
            Object.keys(this.screenVideoProducerIds).includes(deviceId)
          );
          callback({
            id: this.screenVideoProducerIds[deviceId],
          });
        } else if (appData.source === "screenAudio") {
          const deviceId = appData.deviceId as string;
          await waitFor(() =>
            Object.keys(this.screenAudioProducerIds).includes(deviceId)
          );
          callback({
            id: this.screenAudioProducerIds[deviceId],
          });
        } else {
          console.error("Unknown producer type", appData);
        }
      }
    );

    this.producerTransport.on(
      "producedata",
      async ({ sctpStreamParameters, label, protocol, appData }, callback) => {
        if (label === "AvatarMovement") {
          // Send dataProducer data to server
          this.send("produceData", {
            producingPeer: this.avatar_id,
            producerOptions: {
              sctpStreamParameters: sctpStreamParameters,
              label: label,
              protocol: protocol,
              appData: appData,
            },
          });
          // Use label to determine datachannel purpose
          // Wait for producedData signal to set this value
          await waitFor(() => this.movementProducerId !== undefined);
          if (this.movementProducerId) {
            callback({ id: this.movementProducerId });
          }
        } else if (label === "FrameEvents") {
          // Send dataProducer data to server
          this.send("produceEvents", {
            producingPeer: this.avatar_id,
            producerOptions: {
              sctpStreamParameters: sctpStreamParameters,
              label: label,
              protocol: protocol,
              appData: appData,
            },
          });
          // Use label to determine datachannel purpose
          // Wait for producedData signal to set this value
          await waitFor(() => this.frameEventsProducerId !== undefined);
          if (this.frameEventsProducerId) {
            callback({ id: this.frameEventsProducerId });
          }
        } else {
          console.error(
            "ProduceData called on datatransport with unknown label!"
          );
        }
      }
    );

    //Enter the frame, so that the created transports will connect
    this.enterHandler?.(this.room);
  }

  /**
   *  Creates a receiving transport (egress) from the mediaserver to the client.
   *  Setup the actions to take when the transport connects
   *  Also setup actions to take on state change of transports
   *  @public
   *  @param {Object} transport - Peer transport
   */
  async connectEgressTransport(transport: {
    id: Guid;
    iceParameters: IceParameters;
    iceCandidates: IceCandidate[];
    dtlsParameters: DtlsParameters;
    sctpParameters?: SctpParameters;
    egress?: Guid;
  }) {
    this.consumerTransport[transport.id] =
      this.webRTCDevice.createRecvTransport({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        iceServers: (await this.iceHandler()) || [],
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters,
      });
    this.consumerTransport[transport.id].on(
      "connect",
      async ({ dtlsParameters }, callback) => {
        this.send("connectEgressTransport", {
          peerId: this.avatar_id,
          direction: this.consumerTransport[transport.id].direction,
          dtlsParameters: dtlsParameters,
          egress: transport.egress,
        });
        callback();
      }
    );

    this.consumerTransport[transport.id].on(
      "connectionstatechange",
      (connectionState) => {
        console.warn(
          "Consumer transport connection state:",
          connectionState,
          transport.id
        );
        if (connectionState === "connected") {
          console.debug("Consumer transport connected.", transport.id);
        } else if (connectionState === "failed") {
          const actionText = `Please refresh. Email ${branding.support} for additional help`;
          stateManager.getState().addNotification({
            dismissable: true,
            text: `Oops! Your connection to the server has been disrupted. ${actionText}.`,
          });
          this.consumerConnected = false;
        }
      }
    );
  }

  updatePeerMovement(message) {
    function byteToHex(byte) {
      return byte.toString(16).padStart(2, "0");
    }

    function copy(src) {
      const dst = new ArrayBuffer(src.byteLength);
      new Uint8Array(dst).set(new Uint8Array(src));
      return dst;
    }

    function arrayBufferToUuid(arrayBuffer) {
      if (arrayBuffer.byteLength !== 16) {
        throw new Error("Invalid ArrayBuffer length. Expected 16 bytes.");
      }

      const view = new DataView(arrayBuffer);

      const uuidParts = [
        byteToHex(view.getUint8(0)) +
          byteToHex(view.getUint8(1)) +
          byteToHex(view.getUint8(2)) +
          byteToHex(view.getUint8(3)),
        byteToHex(view.getUint8(4)) + byteToHex(view.getUint8(5)),
        byteToHex(view.getUint8(6)) + byteToHex(view.getUint8(7)),
        byteToHex(view.getUint8(8)) + byteToHex(view.getUint8(9)),
        byteToHex(view.getUint8(10)) +
          byteToHex(view.getUint8(11)) +
          byteToHex(view.getUint8(12)) +
          byteToHex(view.getUint8(13)) +
          byteToHex(view.getUint8(14)) +
          byteToHex(view.getUint8(15)),
      ];

      return uuidParts.join("-");
    }

    const UUID_SIZE = 16;
    const FULL_PACKET_SIZE = 78;
    const SHORT_PACKET_SIZE = 36;

    function packedBinaryToMap(packedBinary) {
      const view = new DataView(packedBinary);
      const movementState = {};
      let offset = 0;
      while (offset < packedBinary.byteLength) {
        if (offset + UUID_SIZE > packedBinary.byteLength) {
          console.error("Incomplete UUID at the end of the buffer.");
        }

        const uuid = arrayBufferToUuid(
          packedBinary.slice(offset, offset + UUID_SIZE)
        );
        offset += UUID_SIZE;

        // Check if fullPacket bit is set (see movementProtocol)
        // usually indicating that hand positions are included as well

        if (offset + 2 > packedBinary.byteLength) {
          console.error("Incomplete packet header at the end of the buffer.");
        }
        const fullPacket =
          view.getUint16(offset, true) & PacketHeader.fullPacket;

        const packetSize = fullPacket ? FULL_PACKET_SIZE : SHORT_PACKET_SIZE;

        // Ensure there's enough data left for the movement state
        if (offset + packetSize > packedBinary.byteLength) {
          console.error(
            "Incomplete movement state data at the end of the buffer."
          );
        }

        movementState[uuid] = copy(
          packedBinary.slice(offset, offset + packetSize)
        );
        offset += packetSize;
      }
      return movementState;
    }

    try {
      const movementState = packedBinaryToMap(message.data);
      Object.keys(movementState).forEach((peerId) => {
        this.peerMovementHandler &&
          this.peerMovementHandler(
            movementToJSON(movementState[peerId]),
            peerId
          );
      });
    } catch (err) {
      console.error("Failed to update peer movement", err, message);
    }
  }

  // get announcements from server
  getAudioAnnoucements() {
    this.send("getRoomAudio", { requestingPeer: this.avatar_id });
  }

  getVideoAnnoucements() {
    this.send("getRoomVideo", { requestingPeer: this.avatar_id });
  }

  getMovementAnnoucements(isSpectator: boolean) {
    console.log("@@get movmement annoucements: ", isSpectator);
    this.send("getRoomMovement", {
      requestingPeer: this.avatar_id,
      isSpectator: isSpectator,
    });
  }

  getEventsAnnoucements() {
    this.send("getRoomEvents", { requestingPeer: this.avatar_id });
  }

  closeConsumersForPeer(peerId: string | number) {
    try {
      if (!this.movementConsumers[peerId]) {
        return;
      }
      this.movementConsumers[peerId].forEach(
        (consumer: { close: () => void }) => {
          consumer.close();
        }
      );
      delete this.movementConsumers[peerId];
      this.frameEventsConsumers[peerId]?.forEach(
        (consumer: { close: () => void }) => {
          consumer.close();
        }
      );
      delete this.frameEventsConsumers[peerId];
      this.audioConsumers[peerId]?.close();
      this.videoConsumers[peerId]?.close();
      this.screenAudioConsumers[peerId]?.forEach(
        (consumer: { close: () => void }) => {
          consumer.close();
        }
      );
      delete this.screenAudioConsumers[peerId];
      this.screenVideoConsumers[peerId]?.forEach(
        (consumer: { close: () => void }) => {
          consumer.close();
        }
      );

      delete this.screenVideoConsumers[peerId];
    } catch (e) {
      console.warn(`Error closing consumers for peer ${peerId}:`, e);
    }
  }

  //Run this if event movement server plugin is present
  getRegionalMovementServer(frameName) {
    // We need to request a specific WebSocket/movement server for this room
    // A connect will happen in the response message handler: connectMovementServer

    // If we're already waiting for a response, don't send another request
    // if (this.getMovementServerTimeout) {
    //   return;
    // }

    // If we're already connected to a movement server, don't send another request
    if (
      this.movementTransport &&
      this.movementTransport.readyState === WebSocket.OPEN
    ) {
      return;
    }

    // If we don' get a response, we try again with an exponential backoff
    if (this.movementServerConnectionAttempt < 6) {
      const timeout = this.movementServerConnectionAttempt
        ? 5000 + 2 ** this.movementServerConnectionAttempt * 1000
        : 5000;
      this.getMovementServerTimeout = setTimeout(() => {
        // Clear existing timeouts
        clearTimeout(this.getMovementServerTimeout);
        console.log(
          `Reconnecting to movement server ${frameName} (${this.movementServerConnectionAttempt})`
        );
        // this.send("getMovementServer", {
        //   room: frameName,
        //   region: this.region,
        // });
        if (this.movementServerConnectionAttempt > 0) {
          stateManager.getState().addNotification({
            dismissable: true,
            text: `Oops! Unable to connect to a movement server. We're trying again...`,
          });
        }
        this.getRegionalMovementServer(frameName);
      }, timeout);
    } else {
      clearTimeout(this.getMovementServerTimeout);
      stateManager.getState().addNotification({
        dismissable: true,
        text: `Oops! We can't find a movement server. Please try refreshing.`,
      });
    }
  }

  //Run this if the new movement server is present
  connectRegionalMovementServer(movementServer: any) {
    console.log("@@ connecting event movement server");
    this.regionalMovementServer = true;
    if (this.movementTransport) {
      this.movementTransport.close();
    }

    const host = movementServer.host;
    this.movementServerConnectionAttempt++;
    if (!host) {
      return;
    }

    this.movementTransport = new WebSocket(
      `${host}/${movementServer.room}?peerId=${this.avatar_id}`
    );

    this.movementTransport.binaryType = "arraybuffer";
    this.movementTransport.onopen = () => {
      console.log("Connected to movement server", host);

      // Stop getting movement server if we're connected
      clearTimeout(this.getMovementServerTimeout);
      this.movementServerConnectionAttempt = 0;

      if (this.movementReconnecting) {
        this.movementReconnecting = false;
      }

      // this.movementTransport.send(
      //   JSON.stringify({
      //     type: "id",
      //     peerId: this.avatar_id,
      //     room: movementServer.room,
      //   })
      // );
    };

    this.movementTransport.onclose = (event) => {
      // When we reconnect, we reuse the existing avatar UUID
      if (!event.wasClean) {
        console.log("Connection to movement server closed with error.", event);

        // We ask the signaling server again for a new movement server,
        // since it's possible that the movement server we were connected to
        // is no longer available, but a new one took its place.
        // We only do this if we haven't exceeded the max number of attempts
        if (this.movementServerConnectionAttempt < 6) {
          console.warn(
            "Oops! Connection to our movement server isn't working. Reconnecting."
          );
          this.movementReconnecting = true;
          this.getRegionalMovementServer(movementServer.room);
        }
      } else {
        console.error(
          "Connection to movement server closed without error",
          event
        );
      }
    };
    this.movementTransport.onmessage = this.updatePeerMovement.bind(this);
  }

  /**
   * Leave a frame by sending leaveRoom signal and closing local producers and consumers
   */
  leaveFrame(frameName: string, transitions: boolean) {
    console.debug("Leaving frame", frameName);
    this.avatarMover.stopSendingMovement(); //Do not send movement

    this.leaveHandler?.(frameName); //Trigger babylon events for leaving the frame
    this.leaveCleanup(transitions);
    this.send("leaveRoom", {
      peerId: this.avatar_id,
      room: frameName,
    });
    //Close websocket transport
    //this.signalTransport.close();
    // Close movement transport
    this.movementTransport?.close();
  }

  leaveCleanup(transitions: boolean) {
    // zero off the consumer keeping so it won't break transitions

    //Remove all local bound assets
    // setBoundAssets([]);
    // We should clear frame events when leaving, but we don't do a thorough job of renewing them
    // when joining the next room. This is left as a todo for now
    //this.frameEventsHandler = new Object();
    //Close local consumers

    for (const peerId in this.audioConsumers) {
      this.audioConsumers[peerId].close();
    }
    for (const peerId in this.videoConsumers) {
      this.videoConsumers[peerId].close();
    }
    for (const peerId in this.movementConsumers) {
      for (const consumer of this.movementConsumers[peerId]) {
        consumer.close();
      }
    }
    for (const peerId in this.frameEventsConsumers) {
      for (const consumer of this.frameEventsConsumers[peerId]) {
        consumer.close();
      }
    }
    for (const peerId in this.screenAudioConsumers) {
      if (this.screenAudioConsumers.length > 0) {
        this.screenAudioConsumers[peerId].close();
      }
    }
    for (const peerId in this.screenVideoConsumers) {
      if (this.screenVideoConsumers.length > 0) {
        this.screenVideoConsumers[peerId].close();
      }
    }
    //Close local producers
    //TODO: these need to be arrays for multiple producers
    this.videoProducer?.close();
    this.audioProducer?.close();
    this.screenVideoProducer.forEach((producer) => {
      producer.close();
    });
    this.screenAudioProducer.forEach((producer) => {
      producer.close();
    });
    this.movementProducer?.close();
    this.frameEventsProducer?.close();
    this.movementConsumers = {};
    this.frameEventsConsumers = {};
    this.audioConsumers = [];
    this.videoConsumers = [];
    this.screenAudioConsumers = [];
    this.screenVideoConsumers = [];
    this.screenAudioProducerIds = [];
    this.screenAudioProducerIds = [];
    //Close webrtc transports
    for (const transport in this.consumerTransport) {
      this.consumerTransport[transport].close();
    }

    if (this.producerTransport) {
      this.producerTransport?.close();
    }
    if (transitions) {
      const webcamElement = document.querySelector(
        '[data-mediaSource="webcam"]'
      );
      if (webcamElement) {
        setAvatar({
          videoPanelEnabled: false,
        });
        this.videoProducer = undefined;
        webcamElement.remove();
      }
      const microphoneElement = document.querySelector(
        '[data-mediaSource="microphone"]'
      );
      if (microphoneElement) {
        this.audioProducer = undefined;
        microphoneElement.remove();
      }
      this.producerTransport = undefined;
      this.consumerTransport = [];
    }
  }
}

//window.avatar = avatar;
