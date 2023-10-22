/**
 *  This file assigns the babylon actions to take when the avatar core reaches certain states
 *  @file avatar-harness.js
 */

import { avatar } from "../core/avatar";
import peerStore from "../core/peerState";
import stateManager from "../core/state";
import streamManager from "../core/streamManager";
import { setAvatar, setBoundAssets } from "../core/stateHandlers.js";
import PeerManager from "../babylon/managers/PeerManager";

import { VideoTexture } from "@babylonjs/core/Materials/Textures/videoTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Sound } from "@babylonjs/core/Audio/sound";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Basketball } from "../babylon/games/basketball/Basketball";
import {
  broadcastMessageDataChannels,
  userAssetSpawnDataChannels,
  emojiBlastDataChannels,
  gatherHandler,
} from "./subscribes";
import { assetState } from "../core/assetState";

let enteredFrame = false;
// Monkey patch for https://forum.babylonjs.com/t/attaching-audio-to-a-mesh-seems-to-be-broken-in-latest/25469
Sound.prototype.setPosition = function (newPosition) {
  if (newPosition.equals(this._position)) {
    return;
  }
  this._position.copyFrom(newPosition);
  if (
    Engine.audioEngine?.canUseWebAudio &&
    this.spatialSound &&
    this._soundPanner &&
    !isNaN(this._position.x) &&
    !isNaN(this._position.y) &&
    !isNaN(this._position.z)
  ) {
    this._soundPanner.setPosition(
      this._position.x,
      this._position.y,
      this._position.z
    );
  }
};

/**
 * This is a description of the MyClass constructor function.
 * @class
 * @classdesc This is a description of the MyClass class.
 */
export default class avatarHarness {
  /**
   * Connect the avatar to the avatar server,
   *   called when interface (babylon) has loaded
   */
  connect(signalingURL) {
    this.avatar.connect(signalingURL);
  }

  /**
   * Construct a harness so that the interface can set appropriate
   *  reactions to avatar signals, audio, video, and datachannels.
   */
  constructor() {
    this.avatar = new avatar();

    window.avatarLink = this.avatar;

    this.updatePeer = peerStore.getState().updatePeer;
    this.setPeer = peerStore.getState().setPeer;
    this.deletePeer = peerStore.getState().deletePeer;

    this.avatar.setICEHandler(this.ICE_handler);
    this.avatar.setIdentityHandler(this.Identity_handler);
    this.avatar.setHushedHandler(this.Hushed_handler);
    this.avatar.setPeerCountHandler(this.PeerCount_handler);
    this.avatar.setPeerIndicatorsHandler(this.PeerIndicators_handler);
    this.avatar.setAudioHandler(this.Audio_handler);
    this.avatar.setVideoStateHandler(this.VideoState_handler);
    this.avatar.setVideoHandler(this.Video_handler);
    this.avatar.setMovementHandler(this.Movement_handler);
    this.avatar.setEnterHandler(this.Enter_handler);
    this.avatar.setLeaveHandler(this.Leave_handler);
    this.avatar.setAudioHandler(this.Audio_handler);
    this.avatar.setPeerDisconnectHandler(this.PeerDisconnect_handler);

    this.avatar.setFrameEventsHandler(
      "userAssetSpawn",
      userAssetSpawnDataChannels
    );
    this.avatar.setFrameEventsHandler("emojiBlast", emojiBlastDataChannels);
    this.avatar.setFrameEventsHandler(
      "broadcastMessage",
      broadcastMessageDataChannels
    );
    this.avatar.setFrameEventsHandler("gather", gatherHandler);

    // state subscriptions
    stateManager.subscribe(
      (state) =>
        state.micBlockedFromFrame() && state.hardwareEnabled.microphone,
      (needsMicCut) => {
        if (needsMicCut) {
          this.avatar.setMediaState({
            audioTrack: false,
            videoTrack: undefined,
          });
        }
      }
    );
    stateManager.subscribe(
      (state) => state.camBlockedFromFrame() && state.avatar.videoPanelEnabled,
      (needsCameraCut) => {
        if (needsCameraCut) {
          // disables avatar cam only, streaming screen may continue
          setAvatar({ videoPanelEnabled: false });
        }
      }
    );
    stateManager.subscribe(
      (state) => state.boundAssets.length && state.streamScreensDisabled(),
      (needsScreenCut) => {
        if (needsScreenCut) {
          // unbind any streaming screens to cut feed and release control
          const boundAssets = stateManager.getState().boundAssets;
          const remainingAssets = boundAssets.filter(
            (n) => n.source !== "screenVideo" && n.source !== "webcam"
          );
          if (remainingAssets.length < boundAssets.length) {
            setBoundAssets(remainingAssets);
          }
        }
      }
    );

    // changes to frame name after initial binding are transitions
    stateManager.subscribe(
      (state) => state.frame.name,
      async (frameName, previousFrameName) => {
        if (previousFrameName) {
          await this.avatar.leaveFrame(previousFrameName, true);
          enteredFrame = false;
        }
        // No framename means we went home and just want to disconnect
        if (!frameName) {
          return;
        }
        if (!enteredFrame) {
          this.avatar.enterFrame(frameName);
          enteredFrame = true;
        }
      }
    );
    //
  }

  /**
   * Called when the avatar attempts to make a WebRTC connection
   *  Return a set of ice tokens from your favorite STURN/TURN provider
   */
  ICE_handler = async () => {
    const iceServers = await fetch(
      stateManager.getState().apiURL + "/extcom/stunturn"
    );
    const iceServersJSON = await iceServers.json();
    return iceServersJSON;
  };

  /**
   * Called when the avatar receives an identity from the server
   * @param id - The avatar's ID, as sent by the api server
   */
  Identity_handler = (id) => {
    //Enables ticks for peer movements
    PeerManager.setCustomTicks();

    stateManager.setState({
      avatarId: id,
    });

    let frameName = window.location.pathname.substring(1);
    //Enter a frame known by the URL
    if (frameName === "home" || frameName === "Home") {
      stateManager.getState().addNotification({
        dismissable: true,
        text: `Oops! ${frameName} is a reserved frame name. Please use another frame name and try again`,
      });

      return;
    }
    this.avatar.enterFrame(frameName);
    enteredFrame = true;
  };

  /**
   * Called when the avatar receives instructions to stop their audio/video
   */
  Hushed_handler = () => {
    this.avatar.setMediaState({ audioTrack: false, videoTrack: undefined });
    setAvatar({
      audioMuted: true,
    });
  };

  /**
   * Called when the avatar receives a new peer count from the server
   * @param roomName - Name of the frame this count corresponds to
   * @param roomCounts - Count object containing peer counts, { participantCount, lobbyCount, peerCount, spectatorCount }
   */
  PeerCount_handler = async (roomName, roomCounts) => {
    const frameState = stateManager.getState().frame;
    if (roomName === frameState.spaceID) {
      stateManager.setState(roomCounts);
    }
    //Set metrics for frames that are not this frame
    //Set the counts for the destinations.
    let destination = stateManager.getState().destinations.find((dest) => {
      return dest.value === roomName;
    });
    let destinationIndex = stateManager
      .getState()
      .destinations.findIndex((dest) => {
        return dest.value === roomName;
      });
    if (destination !== undefined) {
      let localDestinations = stateManager.getState().destinations;
      let tempObject = new Object({
        ...localDestinations[destinationIndex],
        ...roomCounts,
      });
      delete localDestinations[destinationIndex];
      Object.assign(localDestinations, { [destinationIndex]: tempObject });

      stateManager.setState({
        destinations: [...localDestinations],
      });

      let globalDestination = stateManager
        .getState()
        .globalDestinations.find((dest) => {
          return dest.value === roomName;
        });
      let globalDestinationIndex = stateManager
        .getState()
        .globalDestinations.findIndex((dest) => {
          return dest.value === roomName;
        });
      if (globalDestination !== undefined) {
        let globalDestinations = stateManager.getState().globalDestinations;
        let tempObject = new Object({
          ...globalDestinations[globalDestinationIndex],
          ...roomCounts,
        });
        delete globalDestinations[globalDestinationIndex];
        Object.assign(globalDestinations, {
          [globalDestinationIndex]: tempObject,
        });

        stateManager.setState({
          globalDestinations: [...globalDestinations],
        });
      }
    }
  };

  /**
   * Called when remote the avatar receives a new peer count from the server
   * @param peerId - Peer to apply the indicator changes to
   * @param indicators - Object representing new state of the peer
   */
  PeerIndicators_handler = (peerId, indicators, shouldReply) => {
    //Make a new peer object if this peer is an new peer
    //  todo: replace with peer coordinator class
    if (
      peerStore.getState().avatars[peerId] === undefined &&
      peerStore.getState().facades[peerId] === undefined
    ) {
      PeerManager.createPeer(peerId);
      if (shouldReply) {
        this.avatar.send("replyPeerIndicators", {
          indicators: {
            facade: stateManager.getState().facade,
            avatar: stateManager.getState().avatar,
            assetBindings: { ...stateManager.getState().boundAssets }, // TODO fixme. boundassets will turn into a {} if empty (not a [])
          },
          peerId: this.avatar.avatar_id,
          originId: peerId,
        });
      }
    }

    if (indicators.avatar) {
      const peer = PeerManager.peersMap[peerId];
      const currentZone = stateManager.getState().avatar.voiceZone;

      if (indicators.avatar.supportRequestInfo?.time) {
        window.dispatchEvent(
          new CustomEvent("playSound", {
            detail: { sound: "newQuestion" },
          })
        );
      }

      //Only act if the voice zone indicator is defined
      if (indicators.avatar.voiceZone !== undefined) {
        //Compare current voice zone to peer voice zone
        if (indicators.avatar.voiceZone === currentZone) {
          // Peer is in the local zone, let them be heard
          this.avatar.mutePeer(false, peerId);
        } else {
          // Peer is not in the local zone, silence them
          this.avatar.mutePeer(true, peerId);
        }
      }

      if (
        !stateManager.getState().isChromeDesktop() &&
        peer &&
        peer.remoteSound
      ) {
        if (indicators.avatar.megaphoneEnabled) {
          peer.remoteSound.updateOptions({ refDistance: 10000 });
        } else {
          peer.remoteSound.updateOptions({ refDistance: 1 });
        }
      }

      //badly determing if the video panel should be shown
      //indicators.avatar.videoPanelEnabled !== undefined
      if (indicators.avatar.videoPanelEnabled !== undefined) {
        if (peer) {
          if (indicators.avatar.videoPanelEnabled) {
            peer.videoPanel.setEnabled(true);
            peer.videoPanel?.material?.diffuseTexture?.video?.setAttribute(
              "loaded",
              "true"
            );
          } else {
            peer.videoPanel.setEnabled(false);
          }
        } else {
          console.error(
            "There is no peer... one should be here or be created now"
          );
        }
      }

      if (indicators.avatar.seatId !== "none") {
        const chair = assetState
          .getState()
          .basemodelChairs()
          .find((chair) => chair.name === indicators.avatar.seatId);
        if (chair) {
          chair.occupied = true;
        }
      }
      // mute consumer
      if (indicators.avatar.audioMuted !== undefined) {
        if (peer.data.info.voiceZone === currentZone) {
          if (indicators.avatar.audioMuted) {
            this.avatar.mutePeer(true, peerId);
          } else if (indicators.avatar.audioMuted === false) {
            this.avatar.mutePeer(false, peerId);
          }
        }
      }
      //}
    }
    //Set the state of the peer in the peer store
    // This will also trigger updates to peer instances
    if (indicators.avatar && Object.keys(indicators.avatar).length !== 0) {
      this.updatePeer(peerId, "avatars", indicators.avatar);
      PeerManager.updatePeerInfo(peerId, indicators.avatar);
    }
    if (indicators.facade && Object.keys(indicators.facade).length !== 0) {
      this.updatePeer(peerId, "facades", indicators.facade);
      PeerManager.updatePeerFacade(peerId, indicators.facade);
    }
    if (indicators.assetBindings) {
      this.setPeer(peerId, "assetBindings", indicators.assetBindings);
    }
  };

  /**
   * Called when remote avatar has disconnected and should be disposed of
   * @param peerId - Peer to remove and dispose of
   */
  PeerDisconnect_handler = (peerId) => {
    if (Basketball?.gameInstance) {
      Basketball.gameInstance.removePeerBall(peerId); //remove peer basketball when they disconnect
    }
    const microphoneElement = document.querySelector(
      '[data-remotePeer="' + peerId + '"][data-mediaSource="microphone"]'
    );
    if (microphoneElement) {
      microphoneElement.remove();
    }
    const camElement = document.querySelector(
      '[data-remotePeer="' + peerId + '"][data-mediaSource="webcam"]'
    );
    if (camElement) {
      camElement.remove();
    }
    PeerManager.deletePeer(peerId); // deletes peer instance
    this.deletePeer(peerId); // deletes peer store
  };

  /**
   * Called when remote avatar has entered the frame
   */
  Enter_handler = (roomName) => {
    console.log("Entering frame", roomName);

    //Make connect button clickable
    // there's a race with autoconnect, so we might need to wait a bit
    setTimeout(() => {
      stateManager.setState({
        isWebRTCReady: true,
      });
    }, 2000);
  };

  /**
   * Called when remote avatar has left the frame
   */
  Leave_handler = () => {
    //Remove peers from manager
    for (let peer in PeerManager.peersMap) {
      //Remove element for the peer
      let mediaElements = document.querySelectorAll(
        '[data-remotePeer="' + peer + '"]'
      );
      mediaElements.forEach((element) => {
        element.remove();
      });
      PeerManager.deletePeer(peer);
      this.deletePeer(peer); // deletes from peerState
    }
  };

  /**
   * Called when remote avatar has disconnected and should be disposed of
   * @param peerId - Peer to remove and dispose of
   * @param track - audio track
   * @param appData - Application level data about this track
   */
  Audio_handler = (peerId, track, appData) => {
    let peerAudio = document.querySelector(
      '[data-remotePeer="' +
        peerId +
        '"][data-mediaSource="' +
        appData.source +
        '"][data-deviceId="' +
        appData.deviceId +
        '"]'
    );
    if (appData.source === "screenAudio") {
      if (!peerAudio) {
        peerAudio = streamManager.createAudioElement(track, true);
        peerAudio.setAttribute("data-remotePeer", peerId);
        peerAudio.setAttribute("data-mediaSource", appData.source);
        peerAudio.setAttribute("data-deviceId", appData.deviceId);
        document.body.appendChild(peerAudio);
      } else {
        peerAudio.srcObject = new MediaStream([track]);
      }
      peerAudio.pause();
      return;
    }

    const peer = PeerManager.peersMap[peerId];

    if (!peerAudio) {
      //Create audio element and attach to DOM
      peerAudio = streamManager.createAudioElement(track, true);
      peerAudio.setAttribute("data-remotePeer", peerId);
      peerAudio.setAttribute("data-mediaSource", appData.source);
      peerAudio.setAttribute("data-deviceId", appData.deviceId);
      document.body.appendChild(peerAudio);
      peer.audioSrcObject = peerAudio.srcObject;
      peer.audioElement = peerAudio;

      if (!stateManager.getState().isChromeDesktop()) {
        let remoteSound = new Sound(
          "audio",
          peerAudio.srcObject,
          global.scene,
          () => {
            console.log("Audio Engine:", Engine.audioEngine);
            console.log("Audio Context:", Engine.audioEngine.audioContext);
          },
          {
            streaming: true,
            autoplay: false,
            spatialSound: true,
            maxDistance: 100,
            refDistance: 3,
            rolloffFactor: 0.5,
            distanceModel: "inverse",
            loop: true,
          }
        );

        remoteSound.attachToMesh(peer.root);
        if (stateManager.getState().isMobileSafari) {
          remoteSound.setVolume(7);
          const gainNode = remoteSound.getSoundGain();
          gainNode.gain.value = 7;
        }
        remoteSound.play();
        peer.remoteSound = remoteSound;
      } else {
        //Play audio from native element with chrome
        peerAudio.muted = false;
        peerAudio.play();
      }
    }
  };

  /**
   * Called when remote avatar has changed video state
   */
  VideoState_handler = () => {};

  /**
   * Called when remote avatar has changed video state
   * @param peerId - Peer to remove and dispose of
   * @param track - audio track
   * @param appData - Application level data about this track
   */
  Video_handler = (peerId, track, appData) => {
    console.log("created video  for " + peerId);
    let peerVideo = document.querySelector(
      '[data-remotePeer="' +
        peerId +
        '"][data-mediaSource="' +
        appData.source +
        '"][data-deviceId="' +
        appData.deviceId +
        '"]'
    );

    let peer = PeerManager.peersMap[peerId];

    if (!peerVideo) {
      //Create video element and attach to DOM
      peerVideo = streamManager.createVideoElement(track);
      peerVideo.setAttribute("data-remotePeer", peerId);
      peerVideo.setAttribute("data-mediaSource", appData.source);
      peerVideo.setAttribute("data-deviceId", appData.deviceId);
      document.body.appendChild(peerVideo);

      //Put video on peer video panel
      //Setup video material to show track from native element
      if (appData.source === "webcam") {
        const postDataLoaded = () => {
          peerVideo.removeEventListener("loadeddata", postDataLoaded);
          let videoMaterial = new StandardMaterial(
            "videoMaterial",
            global.scene
          );
          //Video texture requires video element, or src
          let videoTexture = new VideoTexture(
            "videoTexture",
            peerVideo,
            global.scene
          );
          videoMaterial.diffuseTexture = videoTexture;
          videoMaterial.roughness = 1;
          videoMaterial.emissiveColor = Color3.White();
          videoMaterial.disableLighting = true;
          peer.videoPanel.material = videoMaterial;
          if (peer.videoPanel.isEnabled()) {
            peerVideo.setAttribute("loaded", true);
          }
        };
        peerVideo.addEventListener("loadeddata", postDataLoaded);
        //resize plane when video resizes
        peerVideo.addEventListener("resize", (event) => {
          peer.videoPanel.height = event.target.videoHeight;
          peer.videoPanel.width = event.target.videoWidth;
          console.log(
            "Remote video size changed to" +
              event.target.videoWidth +
              "x" +
              event.target.videoHeight
          );
        });
        //Show video error on error
        peerVideo.addEventListener("error", (event) => {
          console.log("Video error has occured:", event);
        });
        //Show video lag on lag
        peerVideo.addEventListener("stalled", (event) => {
          console.log("Video error has occured:", event);
        });
      }
    } else {
      peerVideo.srcObject = new MediaStream([track]);
      peerVideo.play();
    }

    //Setup image as a poster for the video
    // var imageMaterial = new StandardMaterial(
    //   "imageMaterial",
    //   global.scene
    // );
    // imageMaterial.emissiveColor = Color3.White();
    // imageMaterial.ambientTexture = new Texture(
    //   "/img/pinkmicoff.png",
    //   global.scene
    // );
    // plane.material = imageMaterial;

    //Show video on an asset, if set to do so
    // (peer indicators can come in before or after video annoncement)
    // mock get state update
    this.setPeer(
      peerId,
      "assetBindings",
      peerStore.getState().assetBindings[peerId]
    );
  };

  /**
   * Called when remote avatar has send movement data to us
   * @param dataArray - the array of movement data
   * @param peerId - Peer to apply the movement to
   */
  Movement_handler = (dataArray, peerId) => {
    const peer = PeerManager.peersMap[peerId];

    if (!peer || stateManager.getState().avatar.lobby) {
      return;
    }

    let peerAvatar = peer.root;
    if (peerAvatar) {
      dataArray.map((data) => {
        //If chrome, do volume control for spatialization
        if (
          stateManager.getState().isChromeDesktop() &&
          data.type === "avatar"
        ) {
          if (peer.audioElement) {
            if (
              peer.data &&
              peer.data.info &&
              !peer.data.info.megaphoneEnabled
            ) {
              const distance = Math.sqrt(
                Math.pow(data.position.x - global.camera.position.x, 2) +
                  Math.pow(data.position.z - global.camera.position.z, 2)
              );
              const newVolume = (100 - distance * 4) / 100;
              peer.audioElement.volume = newVolume > 0 ? newVolume : 0.01;
            } else {
              peer.audioElement.volume = 1;
            }
          }
        }
        peer.updatePositionRotation(
          data.type,
          data.position,
          data.rotation,
          data.gamePiecePosition,
          data.gamePieceRotation,
          data.frequent
        );
      });
    }
  };
}
