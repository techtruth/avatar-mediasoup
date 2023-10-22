/*                        *
 * Frame Core entry point *
 *                        */
/* TODO: improve the loading of fonts.scss. to be compatible with the current loading screen and entrypoint situation, we are loading this file temporarily from index.js directly instead of within the theme. */
import "./logSaver"; //Cloud logs
import "@/plugins/themes/base/fonts.scss";
import "./style.css"; //Styles for core module
import credentials from "../credentials.json";
import stateManager from "./state";
import { waitForState } from "./state-utils";
import dbSettings from "./dbSettings";
import dbUser from "./dbUser";
import { bindPortalToState } from "./dbPortal";
import { initiateInventoryHandler } from "./inventoryHandler";
import { setupQuickHelp } from "./quickHelp";
import { runDeviceDetection } from "./utils/deviceDetection";
import { processSlackWebHook } from "./utils/slackOAuth";
import { processFrameEntryNotifications } from "./utils/frameEntryNotifications";
import { LoadingScreen } from "./LoadingScreen";
import { SpeechToTextService } from "./utils/speechToTextService";
// this is a necessary polyfill, don't just delete this without asking about it @techtruth
import "core-js/modules/es.array.at";

//Import branding
import "../stage/branding/style.css"; //Import branding colors from branding
import "../stage/branding/logo.svg";
import "../stage/branding/meta-image.png?staticUrl";
import "./plausibleAnalytics";
import "./google-accounts-api";
import "./google-api";
import "./rewardful";
import "./utils/region"; // Start region detection

console.debug("Core module loading...");
// Determine browser capabilities
if (navigator.xr) {
  navigator.xr
    .isSessionSupported("immersive-vr")
    .then((enabled) => {
      stateManager.setState({ vrImmersable: enabled });
    })
    .catch((err) => console.warn("XR access disallowed", err.message));
}

// read global application settings from the database
// and sync it to state as a "deeper state"
dbSettings.bindApplicationSettingsToState();

// guarantee the domContentLoaded state gets set no matter
// whether this runs before or after the actual event
if (/complete|interactive|loaded/.test(document.readyState)) {
  stateManager.setState({ domContentLoaded: true });
} else {
  document.addEventListener(
    "readystatechange",
    () => {
      if (document.readyState === "interactive") {
        stateManager.setState({ domContentLoaded: true });
      }
    },
    { once: true }
  );
}

// Shaka player
window.shaka = require("shaka-player");
LoadingScreen.setup();

runDeviceDetection();

// Setup quickhelp

// Require avatar adapter
//require("./avatar");

// connect firebase auth to state
dbUser.bindUserToState();

bindPortalToState();

initiateInventoryHandler();

// check for & process slack OAuth code
processSlackWebHook();

// "Someone has entered your frame" notifications
processFrameEntryNotifications();

setupQuickHelp(credentials.quickHelp);

// one-time watcher to track if user has previously connected
// can be used to differentiate first load from transition state
// prior to connect
waitForState(stateManager, "isConnected").then(() => {
  stateManager.setState({ hasEverConnected: true });
  new SpeechToTextService();
});

// Make `stateManager` globally accessible via console ONLY in dev build/mode
if (process.env.NODE_ENV === "development") {
  window.stateManager = stateManager;
  console.debug(
    "stateManager is globally available in development mode for inspection/debugging:",
    window.stateManager.getState()
  );
}

console.debug("Core module loaded");
