import "./style.css";
import state from "../core/state"; //Import state handler
import { setRegion } from "../core/utils/region";
import avatarHarnessClass from "./avatar-harness";
import { GlobalStateType, SubscribeStoreApi } from "@core/state-utils";
import "../core/logSaver";

//Set api/signaling to development current
const urlParams = new URLSearchParams(window.location.search);
const connectionTarget = urlParams.get("target") || "dev";
const connectionPort = urlParams.get("port") || "443";
let proposeAudio: string | null | boolean = urlParams.get("audio");
let proposeVideo: string | null | boolean = urlParams.get("video");
let proposeMovement: string | null | boolean = urlParams.get("movement");
let proposeMovementInterval: string | null | boolean =
  urlParams.get("movementInterval");
let proposeTransitions: string | null | boolean = urlParams.get("transitions");
let proposeToFrame: string | null = urlParams.get("toFrame");
let initCall = false;
const region = urlParams.get("region");
const avatarHarness = new avatarHarnessClass();
// Override with full URLs if provided, allowing for localhost or whitelabel testing
const apiURLoverride = urlParams.get("apiURL");
const signalingURLoverride = urlParams.get("signalingURL");

console.error("video error log", proposeVideo);

function proposeValue(value) {
  return !(value === "undefined" || value === null || value === "false");
}

proposeAudio = proposeValue(urlParams.get("audio"));
proposeVideo = proposeValue(urlParams.get("video"));
proposeMovement = proposeValue(urlParams.get("movement"));
proposeMovementInterval = urlParams.get("movementInterval");
proposeTransitions = proposeValue(urlParams.get("transitions"));
proposeToFrame = urlParams.get("toFrame");

if (region) {
  setRegion(region);
} else {
  setRegion("ATL56-P1");
}

const apiURL =
  "https://api." + connectionTarget + ".framevr.io:" + connectionPort;
const signalingURL =
  "wss://api." + connectionTarget + ".framevr.io:" + connectionPort;

// extra state props for diag interface only
interface DiagState {
  diag: {
    movement: boolean;
    movementInterval: string | null;
    audio: boolean;
    video: boolean;
    toFrame: string | null;
  };
}
(state as SubscribeStoreApi<GlobalStateType & DiagState>).setState({
  apiURL: apiURLoverride || apiURL,
  signalingURL: signalingURLoverride || signalingURL,
  diag: {
    movement: proposeMovement,
    movementInterval: proposeMovementInterval,
    audio: proposeAudio,
    video: proposeVideo,
    toFrame: proposeToFrame,
  },
});

// Create and connect the avatar
avatarHarness.connect(state.getState().signalingURL);

if (proposeTransitions && !initCall) {
  setTimeout(() => {
    console.log("@@ transitions: ", proposeToFrame);
    initCall = true;
    // window.location.href = "jasontest?movement=true&audio=true";
    avatarHarness.transitions();
  }, 200000);
}

// The bot's lifecycle in milliseconds
setTimeout(function () {
  console.log("Closing robot connection");
  window.close();
}, 870000); // 15min (less a 30s buffer)
