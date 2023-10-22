//
// This file assigns the babylon actions to take when the avatar core reaches certain states
//

import { avatar } from "../core/avatar";
import stateManager from "../core/state";
import streamManager from "../core/streamManager";
import { setAvatar } from "../core/stateHandlers.js";
import HTMLWidgets from "./widgets"; //HTML widgets

export default class avatarHarness {
  /**
   * Connect the avatar to the avatar server,
   *   called when interface (babylon) has loaded
   */
  connect(signalingURL) {
    this.avatar.connect(signalingURL);
  }
  transitions(fromFrame, toFrame) {
    console.log("Transitioning from", fromFrame, "to", toFrame);
    this.avatar.leaveFrame(fromFrame);
    this.avatar.enterFrame(toFrame);
  }

  /**
   * Construct a harness so that the interface can set appropriate
   *  reactions to avatar signals, audio, video, and datachannels.
   */
  constructor() {
    this.avatar = new avatar();
    this.random = Math.random();
    this.peers = new Array();
    this.widgets = new HTMLWidgets();

    //TODO: Remove global refs...
    window.avatarLink = this.avatar;

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

    this.facade = stateManager.getState().facade;
    this.facade.type = "Human";

    this.peerCount = 1;
    this.peerIndex = undefined;
  }

  /**
   * Called when the avatar attempts to make a WebRTC connection
   *  Return a set of ice tokens from your favorite STURN/TURN provider
   */
  ICE_handler = () => {
    console.debug("Diagnostics interface does not use STUN/TURN");
    return undefined;
  };

  /**
   * Called when the avatar receives an identity from the server
   * @param id - The avatar's ID, as sent by the api server
   */
  Identity_handler = (id) => {
    this.widgets.addPeer(id);
    this.widgets.setPeerIndicator(id, { "<<<<": "self" });
    stateManager.setState({
      avatarId: id,
      loadingScreen: false,
    });

    //Enter a frame known by the URL
    this.avatar.enterFrame(window.location.pathname.substring(1));
  };

  /**
   * Called when the avatar receives instructions to stop their audio/video
   */
  Hushed_handler = () => {};

  /**
   * Called when the avatar receives a new peer count from the server
   * @param roomName - Name of the frame this count corresponds to
   * @param roomCounts - Count object containing peer counts
   */
  PeerCount_handler = (roomName, roomCounts) => {
    if (this.peerIndex === undefined) {
      this.peerIndex = roomCounts.participantCount;
      setAvatar({
        nametag: this.peerIndex.toString(),
      });
    }
    this.peerCount = roomCounts.peerCount;
  };

  /**
   * Called when remote the avatar receives a new peer count from the server
   * @param peerId - Peer to apply the indicator changes to
   * @param indicators - Object representing new state of the peer
   */
  PeerIndicators_handler = (peerId, indicators) => {
    console.debug("Peer indicator:", peerId, indicators);
    //Make a new peer object if this peer is an new peer
    //  todo: replace with peer coordinator class
    if (!this.peers.includes(peerId)) {
      this.avatar.send("replyPeerIndicators", {
        indicators: {
          facade: this.facade,
          avatar: stateManager.getState().avatar,
          assetBindings: { ...stateManager.getState().boundAssets }, // TODO fixme. boundassets will turn into a {} if empty (not a [])
        },
        originId: peerId,
        peerId: this.avatar.avatar_id,
      });
      this.peers.push(peerId);
      this.widgets.addPeer(peerId);
    }

    //Set peer indicators
    this.widgets.setPeerIndicator(peerId, indicators);
  };

  /**
   * Called when remote avatar has disconnected and should be disposed of
   * @param peerId - Peer to remove and dispose of
   */
  PeerDisconnect_handler = (peerId) => {
    console.log("Got disconnect peer", peerId);
    this.widgets.removePeer(peerId);
  };

  /**
   * Called when remote avatar has entered the frame
   */
  Enter_handler = (roomName) => {
    console.log("Entering frame", roomName);
    //setAvatar({
    //  facade: this.facade,
    //  avatar: stateManager.getState().avatar.info,
    //  assetBindings: { ...stateManager.getState().boundAssets }, // TODO fixme. boundassets will turn into a {} if empty (not a [])
    //});

    let diagSettings = stateManager.getState().diag;

    if (diagSettings.movement) {
      streamManager
        .requestMedia({
          audio: diagSettings.audio,
          video: diagSettings.video,
        })
        .then((mediaStreams) => {
          this.avatar.participate(true, true);
          this.avatar.addMedia(mediaStreams);
        });
    } else {
      this.avatar.participate(false, true);
    }
    this.gridHeadRollMovement(diagSettings.movementInterval);
  };

  /**
   * Called when remote avatar has left the frame
   */
  Leave_handler = (roomName) => {
    console.log("Leaving frame", roomName);
    avatar.avatarMover.stopSendingMovement();
  };

  /**
   * Called when remote avatar has disconnected and should be disposed of
   * @param peerId - Peer to remove and dispose of
   * @param track - audio track
   * @param appData - Application level data about this track
   */
  Audio_handler = (peerId, track, appData) => {
    console.log("Got audio track from", peerId, track, appData);

    //Find element in DOM
    let peerAudio = document.querySelector(
      '[data-remotePeer="' +
        peerId +
        '"][data-mediaSource="' +
        appData.source +
        '"]'
    );

    //Create peer audio, if not found
    if (!peerAudio) {
      peerAudio = streamManager.createAudioElement(track, false);
      peerAudio.setAttribute("data-remotePeer", peerId);
      peerAudio.setAttribute("data-mediaSource", appData.source);
      document.body.appendChild(peerAudio);
    } else {
      peerAudio.srcObject = new MediaStream([track]);
      peerAudio.play();
    }
    this.widgets.addAudioConsumer(peerId, track);
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
    console.log("Got video track from", peerId, track, appData);
    this.widgets.addVideoConsumer(peerId, track);
  };

  /**
   * Called when remote avatar has send movement data to us
   * @param dataArray - the array of movement data
   * @param peerId - Peer to apply the movement to
   */
  Movement_handler = (/*dataArray, peerId*/) => {
    //console.log("Got movement from", peerId, dataArray);
    // this.widgets.addMovementPacket(peerId, dataArray);
  };

  spiralHeadRollMovement = () => {
    const angle = 0.0001 * performance.now();
    let xpos = angle * Math.cos(angle);
    let ypos = angle * Math.sin(angle);

    var radiansToRotateHalf = angle / 2;
    var sineOfRadiansToRotateHalf = Math.sin(radiansToRotateHalf);
    var w = Math.cos(radiansToRotateHalf);
    var x = 0 * sineOfRadiansToRotateHalf;
    var y = 1 * sineOfRadiansToRotateHalf;
    var z = 0 * sineOfRadiansToRotateHalf;
    var magnitude = Math.sqrt(w * w + x * x + y * y + z * z);
    w /= magnitude;
    x /= magnitude;
    y /= magnitude;
    z /= magnitude;

    //Set avatar movement
    this.avatar.avatarMover.setMovement({
      basePosX: xpos,
      basePosY: 1,
      basePosZ: ypos,
      headRotW: w,
      headRotX: x,
      headRotY: y,
      headRotZ: z,
    });
    setTimeout(this.spiralHeadRollMovement, 1000);
  };

  gridHeadRollMovement = (movementInterval) => {
    var radiansToRotateHalf = (0.0001 * Date.now()) / 2;
    var sineOfRadiansToRotateHalf = Math.sin(radiansToRotateHalf);
    var w = Math.cos(radiansToRotateHalf);
    var x = 0 * sineOfRadiansToRotateHalf;
    var y = 1 * sineOfRadiansToRotateHalf;
    var z = 0 * sineOfRadiansToRotateHalf;
    var magnitude = Math.sqrt(w * w + x * x + y * y + z * z);
    w /= magnitude;
    x /= magnitude;
    y /= magnitude;
    z /= magnitude;

    //Get grid and position from peer count
    let nearestRoot = Math.ceil(Math.sqrt(this.peerCount));
    let xpos = Math.floor(this.peerIndex / nearestRoot) * 2;
    let ypos = (this.peerIndex % nearestRoot) * 2;
    //console.log("Peer log", xpos, ypos, this.peerIndex, this.peerCount);

    //Set avatar movement
    this.avatar.avatarMover.setMovement({
      basePosX: xpos,
      basePosY: (radiansToRotateHalf % 3.14).toString(),
      basePosZ: ypos,
      headRotW: w,
      headRotX: x,
      headRotY: y,
      headRotZ: z,
    });
    setTimeout(this.gridHeadRollMovement, movementInterval, movementInterval);
  };
}
