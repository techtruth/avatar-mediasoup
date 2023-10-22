/*                  *
 * State management *
 *  by zustand      */

import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { getUrlParameter } from "./utils/url";
import { getApiUrl, getSignalingUrl } from "./backend";
import branding from "./branding";
import { CameraMode, CameraRecenterMode } from "@core/CameraModeManager";
import { getMainlineDomain } from "@core/utils/joinFunctions";
import { frameCapabilityValue, frameCreate } from "@core/utils/Frame";
import { GlobalStateType, ZoneLockState } from "./state-utils";
import { Timestamp } from "firebase/firestore";
import { baseModelStateHydrate } from "./utils/BaseModel";

const stateManager = createStore<GlobalStateType>()(
  subscribeWithSelector((set, get) => ({
    /**
     * apiURL - the base URL for all API calls
     */
    apiURL: getApiUrl(),

    /**
     * signalingURL - the base URL for all signaling calls
     */
    signalingURL: getSignalingUrl(),

    /**
     * disabledFeatures - list of disabled features
     */
    disabledFeatures: [],
    loadingScreen: true,

    /**
     * which device was selected for microphone
     */
    selectedAudioDevice: true,

    /**
     * video device selected for the user
     */
    selectedVideoDevice: false,

    /**
     * baseModel - the base model for the current frame
     */
    baseModel: baseModelStateHydrate(),

    /**
     * userID string representation of the current userID
     */
    userID: "",

    /**
     * userLoggedIn: whether or not the user is logged in
     */
    userLoggedIn: false,

    /**
     * videoDevices: array of video devices. data type?
     */
    videoDevices: [],

    /**
     * audioDevices - list of available audio devices
     */
    audioDevices: [],

    /**
     * hardwareGranted: whether or not hardware permission is granted. This is the permissions from get user media
     */
    hardwareGranted: {
      microphone: false,
      camera: false,
      desktop: false,
    },

    /**
     * hardwareEnabled: whether or not hardware is enabled. This is not the same as getusermedia permissions becuase this toggles the use, even if permission is granted
     */
    hardwareEnabled: {
      microphone: false,
      camera: false,
      desktop: false,
    },

    /**
     * avatar - Local avatar state. This is referenced when sending PeerIndicators to other peers
     */
    avatar: {
      lobby: true,
      nametag: "Guest",
      statusMessage: undefined,
      audioMuted: true,
      videoPanelEnabled: false,
      megaphoneEnabled: false,
      email: undefined,
    },

    /**
     * facade: data representing the outward appearance of the avatar, like their clothing configuration and avatar type (human, android, RPM)
     * in contrast to the avatar indicators data, which is information about the user like their nametag, if they are muted, if their megaphone is on, etc
     */
    facade: {
      bodyColor: "Blue",
      skinTone: "Tone_1",
      eyeColor: "Blue",
      logo: "FrameLogo",
      gender: "Male",
    },

    /**
     * boundAssets - the base model for the current frame
     */
    boundAssets: []

  }))
);

export default stateManager;
