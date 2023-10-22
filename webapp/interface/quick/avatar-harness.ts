//
// This file assigns the babylon actions to take when the avatar core reaches certain states
//

import { avatar } from "@core/avatar";
import peerStore from "@core/peerState";
import peerManager from "@core/peerState";
import SM from "@core/state";
import streamManager from "@core/streamManager";
import { setAvatar } from "@core/stateHandlers";
import audioIndicator from "@core/audioLevel";
import { flatUIDiscState } from "@webapp/quick/flatUIState";
import { frameHydrate } from "@core/utils/Frame";
import { GlobalStateStoreType } from "@core/state-utils";
const stateManager: GlobalStateStoreType = SM;

export default class avatarHarness {
  avatar: avatar = new avatar();
  remotePeers: Record<string, any> = {};
  updatePeer = peerManager.getState().updatePeer;
  setPeer = peerManager.getState().setPeer;
  deletePeer = peerManager.getState().deletePeer;
  /**
   * Connect the avatar to the avatar server,
   *   called when interface (babylon) has loaded
   */
  connect(signalingURL: string) {
    this.avatar.connect(signalingURL);
  }

  /**
   * Construct a harness so that the interface can set appropriate
   *  reactions to avatar signals, audio, video, and datachannels.
   */
  constructor() {
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

    //Set frame name in state based on URL
    const frameState = stateManager.getState().frame;
    stateManager.setState({
      frame: frameHydrate({
        ...frameState,
        name: window.location.pathname.substring(1),
      }),
    });
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
    window.avatarLink.send("peerIndicators", {
      peerId: id,
      indicators: {
        facade: stateManager.getState().facade,
        avatar: stateManager.getState().avatar,
        assetBindings: { ...stateManager.getState().boundAssets }, // TODO fixme. boundassets will turn into a {} if empty (not a [])
      },
    });
    stateManager.setState({
      avatarId: id,
    });

    this.avatar.enterFrame(window.location.pathname.substring(1));
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
   * @param roomCounts - Count object containing peer counts
   */
  PeerCount_handler = (roomName, roomCounts) => {
    const frameState = stateManager.getState().frame;
    if (roomName === frameState.name) {
      stateManager.setState({
        participantCount: roomCounts.participantCount,
        spectatorCount: roomCounts.spectatorCount,
        peerCount: roomCounts.peerCount,
        lobbyCount: roomCounts.lobbyCount,
      });
    }
  };

  /**
   * Called on new peer indicators change
   * @param peerId - Peer to apply the indicator changes to
   * @param indicators - Object representing new state of the peer
   */
  PeerIndicators_handler = (peerId, indicators) => {
    //Make a new peer object if this peer is an new peer
    //  todo: replace with peer coordinator class
    const existingPeer = peerManager.getState().checkPeer(peerId);

    if (!existingPeer) {
      window.avatarLink.send("peerIndicators", {
        indicators: {
          facade: stateManager.getState().facade,
          avatar: stateManager.getState().avatar,
          assetBindings: { ...stateManager.getState().boundAssets }, // TODO fixme. boundassets will turn into a {} if empty (not a [])
        },
        peerId: window.avatarLink.avatar_id,
      });
    }

    //Set the state of the peer in the peer store
    // This will also trigger updates to peer instance
    if (indicators.avatar && Object.keys(indicators.avatar).length !== 0) {
      const currentZone = stateManager.getState().avatar.voiceZone;
      console.log(
        "peer voice zone: ",
        indicators.avatar.voiceZone,
        "current zone: ",
        currentZone,
        "avatar state: ",
        indicators.avatar
      );
      console.log("++indicator: ", indicators);
      if (indicators.avatar.voiceZone !== undefined) {
        //Peer has indicated that their voice zone has changed
        //Changed to local zone
        console.log(
          "peer voice zone: ",
          indicators.avatar.voiceZone,
          "current zone: ",
          currentZone
        );
        // update indicators for that peer
        if (indicators.avatar.voiceZone === currentZone) {
          if (indicators.avatar.audioMuted) {
            console.log("entering muted, muting now"); /// XXX TEST
            window.avatarLink.mutePeer(true, peerId);
          } else if (indicators.avatar.audioMuted === undefined) {
            //Undefined... consult the stored history
            if (existingPeer.avatar?.audioMuted) {
              window.avatarLink.mutePeer(true, peerId);
            } else if (
              existingPeer.avatar &&
              existingPeer.avatar.audioMuted === false
            ) {
              window.avatarLink.mutePeer(false, peerId);
            }
          } else if (indicators.avatar?.audioMuted === false) {
            window.avatarLink.mutePeer(false, peerId);
          }
        } else {
          //Not in local zone, mute the remote peer
          window.avatarLink.mutePeer(true, peerId);
          window.avatarLink.mutePeerScreen(true, peerId);
          window.avatarLink.mutePeerScreenAudio(true, peerId);
        }
      } else {
        //Peer has not indicated a change, or could be in main voice zone
        if (indicators.avatar.audioMuted) {
          window.avatarLink.mutePeer(true, peerId);
        } else if (indicators.avatar.audioMuted === undefined) {
          //No action...
        } else if (indicators.avatar.audioMuted === false) {
          if (currentZone === existingPeer.avatar.voiceZone) {
            window.avatarLink.mutePeer(false, peerId);
          }
        }
      }

      if (indicators.avatar.videoPanelEnabled !== undefined) {
        flatUIDiscState
          .getState()
          .addRemoteDisc(peerId, indicators.avatar.videoPanelEnabled);
        console.log(
          "remote videoPanelEnabled: ",
          indicators.avatar.videoPanelEnabled,
          "peerId: ",
          peerId
        );
      }

      this.updatePeer(peerId, "avatars", indicators.avatar);
    }
    if (indicators.facade && Object.keys(indicators.facade).length !== 0) {
      this.updatePeer(peerId, "facades", indicators.facade);
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
    console.log("Got disconnect peer", peerId);
    // close audioLevel
    this.remotePeers[peerId]?.close();
    delete this.remotePeers[peerId];
    console.log("ensure all remotePeers gone: ", this.remotePeers);
    // remove the eventlistener -- custom event listener
    (window.removeEventListener as any)(`${peerId}-volumeLevel`, this, false); // TODO fix this. need to store the handler etc. it may not even unbind :c
    const audioElement = document.querySelector(
      `[data-remotepeer="${peerId}"][data-mediasource="microphone"]`
    );
    const videoElement = document.querySelector(
      `[data-remotepeer="${peerId}"][data-mediasource="webcam"]`
    );

    if (audioElement) {
      audioElement.remove();
    }
    if (videoElement) {
      videoElement.remove();
    }

    this.deletePeer(peerId);
  };

  /**
   * Called when remote avatar has entered the frame
   */
  Enter_handler = () => {
    // unused
  };

  /**
   * Called when remote avatar has left the frame
   */
  Leave_handler = () => {
    // unused
  };

  /**
   * Called when remote avatar creates/updates audio
   * @param peerId - Peer to remove and dispose of
   * @param track - audio track
   * @param appData - Application level data about this track
   */
  Audio_handler = (peerId, track, appData) => {
    console.log("Got audio track from", peerId, track, appData);

    //Do whatever we need to do to get audio from this peer playing locally
    // ...
    const remoteIndicator = new audioIndicator(new MediaStream([track]));
    remoteIndicator.initializeVolume(`${peerId}-volumeLevel`);
    this.remotePeers[peerId] = remoteIndicator;
    //Find element in DOM
    let peerAudio = document.querySelector<HTMLAudioElement>(
      '[data-remotePeer="' +
        peerId +
        '"][data-mediaSource="' +
        appData.source +
        '"][data-deviceId="' +
        appData.deviceId +
        '"]'
    );

    //Create peer audio, if not found
    if (!peerAudio) {
      peerAudio = streamManager.createAudioElement(
        track,
        false
      ) as HTMLAudioElement;
      peerAudio.setAttribute("data-remotePeer", peerId);
      peerAudio.setAttribute("data-mediaSource", appData.source);
      document.body.appendChild(peerAudio);
    } else {
      peerAudio.srcObject = new MediaStream([track]);
      peerAudio.play();
    }
  };

  /**
   * Called when remote avatar has changed video state
   */
  VideoState_handler = () => {
    // unused
  };

  /**
   * Called when remote avatar has changed video state
   * @param peerId - Peer to remove and dispose of
   * @param track - audio track
   * @param appData - Application level data about this track
   */
  Video_handler = (peerId, track, appData) => {
    console.log("Got video track from", peerId, track, appData);

    //Find element in DOM
    let peerVideo = document.querySelector<HTMLVideoElement>(
      '[data-remotePeer="' +
        peerId +
        '"][data-mediaSource="' +
        appData.source +
        '"][data-deviceId="' +
        appData.deviceId +
        '"]'
    );

    //Create peer audio, if not found
    if (!peerVideo) {
      // const container = document.querySelector(".scrollmenu");
      peerVideo = streamManager.createVideoElement(track);
      peerVideo.setAttribute("data-remotePeer", peerId);
      peerVideo.setAttribute("data-mediaSource", appData.source);
      // document.querySelector(".remoteMediaContainer")?.appendChild(peerVideo);
      peerVideo.setAttribute("data-deviceId", appData.deviceId);
      // container.appendChild(peerVideo);
      document.body.appendChild(peerVideo);
      if (appData.source === "webcam") {
        flatUIDiscState.getState().addRemoteDisc(peerId, true);
      }
      peerVideo.style.display = "none";
      const currentZone = stateManager.getState().avatar.voiceZone;
      const peers = peerManager.getState().checkPeer();
      // mute all peer screens not in current zone
      for (const peerId in peers) {
        if (peers[peerId].avatar?.voiceZone !== currentZone) {
          window.avatarLink.mutePeerScreen(true, peerId);
          window.avatarLink.mutePeerScreenAudio(true, peerId);
          peerVideo.style.display = "none"; // XXX ??? why is this here again.
        }
      }
    } else {
      peerVideo.srcObject = new MediaStream([track]);
      peerVideo.play();
      // XXX is it possible that its gonna play it even if other zone?
    }
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
  Movement_handler = (/*dataArray, peerId*/) => {
    //console.log("Got movement from", peerId, dataArray);
    // We dont need to listen to movement. dont even start the movemen consumer
  };
}
