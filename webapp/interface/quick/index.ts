// Load Quick Theme css (inherits from Frame Whitelabel theme)
import "./style.css";
import state from "../core/state"; //Import application state
import { setAvatar } from "../core/stateHandlers"; //Import state handlers
import avatarHarnessClass from "./avatar-harness";

const avatarHarness = new avatarHarnessClass();
avatarHarness.connect(state.getState().signalingURL);
//window.location.pathname.substring(1)

state.setState({ loadingScreen: false });
setAvatar({ isFlat: true }); //Inform that we are using 2d interface
