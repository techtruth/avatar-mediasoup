import "@datadog/browser-logs/bundle/datadog-logs";
import process from "process";
import { version } from "../../package.json";
import { name } from "./branding.js";

if (process.env.NODE_ENV !== "development") {
  console.log("Loading datadog remote log export.");
  window.DD_LOGS.init({
    clientToken: "pub7e0e393ec8ad16b60936f1547357ca42",
    site: "us5.datadoghq.com",
    forwardErrorsToLogs: true,
    forwardConsoleLogs: ["error", "warn", "info"],
    forwardReports: "all",
    sampleRate: 100,
    version: version,
    service: name,
  });
}
