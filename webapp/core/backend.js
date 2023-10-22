export function getApiUrl() {
  const ipregex =
    /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/gi;
  if (location.protocol !== "https:") {
    return "http://" + location.host;
  } else if (location.hostname === "localhost") {
    return "https://" + location.host;
  } else if (ipregex.test(location.hostname)) {
    return "https://api.dev.framevr.io";
  } else {
    return "https://api." + location.host;
  }
}

export function getSignalingUrl() {
  const ipregex =
    /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/gi;
  if (location.protocol !== "https:") {
    return "ws://" + location.host;
  } else if (location.hostname === "localhost") {
    return "wss://" + location.host;
  } else if (ipregex.test(location.hostname)) {
    return "wss://api.dev.framevr.io";
  } else {
    return "wss://api." + location.host;
  }
}
