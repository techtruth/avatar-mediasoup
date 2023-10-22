module.exports = {
  launch: {
    headless: "new",
    args: [
      "--no-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--remote-debugging-port=9222",
      "--remote-debugging-address=0.0.0.0",
      "--ignore-gpu-blocklist",
      "--use-angle=default",
      "--enable-gpu-driver-debug-logging",
    ],
    ignoreDefaultArgs: [
      "--disable-gpu-compositing",
      "--allow-pre-commit-input",
      "--mute-audio",
    ],
  },
  browserContext: "default",
};
