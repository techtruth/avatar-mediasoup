//import { log } from "console";
const fs = require("fs");
const { toMatchImageSnapshot } = require("jest-image-snapshot");
const { installMouseHelper, saveConsole } = require("./testHelpers");

//Create directory to run the service test
const outputFolder = "test/Service-Test" + Date.now() + "/";
if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder);
}

jest.setTimeout(60000);

describe("Clone Army Service Load Test", () => {
  beforeAll(async () => {
    expect.extend({ toMatchImageSnapshot });

    //Make mouse visible
    installMouseHelper(page);

    //Save console log to file
    page.on("console", (msg) => saveConsole(outputFolder, msg));

    //Configure puppeteer page
    //await page.setViewport({ width: 192, height: 108 });
    //await page.setViewport({ width: 1920, height: 1080 });
    await page.setViewport({ width: 780, height: 420 });
    await page.setDefaultNavigationTimeout(0);

    //Navigate to a frame page
    await page.goto("http://localhost:8080/loadtest");
    //Wait for loading screen appear and then vanish
    await page.waitForSelector("div#loading-screen", {
      hidden: false,
      timeout: 0,
    });
    await page.waitForSelector("div#loading-screen", {
      hidden: true,
      timeout: 0,
    });
  });

  test("Check if connect button is Blue", async () => {
    //Wait for page to load
    await page.waitForTimeout(5000); //Wait 5 seconds until it is ready

    // Screen shot result
    let afterClick = await page.screenshot({
      path: outputFolder + "CheckConnectButton.png",
    });

    //Compare screen shot to valid saved
    expect(afterClick).toMatchImageSnapshot({
      failureThreshold: "0.01",
      failureThresholdType: "percent",
      customSnapshotsDir: `test/service/valid`,
      customSnapshotIdentifier: "CheckConnectButton",
      noColors: false,
    });
  });

  test("Click Connect button", async () => {
    // Click connect button
    await page.mouse.click(350, 210, { button: "left" });

    await page.waitForTimeout(5000); //Wait 5 seconds until it is ready

    // Screen shot result
    let afterClick = await page.screenshot({
      path: outputFolder + "ClickConnectButton.png",
    });

    //Compare screen shot to valid saved
    expect(afterClick).toMatchImageSnapshot({
      failureThreshold: "0.01",
      failureThresholdType: "percent",
      customSnapshotsDir: `test/service/valid`,
      customSnapshotIdentifier: "ClickConnectButton",
      noColors: false,
    });
  });

  test("Move around", async () => {
    // Click connect button
    let keyTime = 5000;
    await page.keyboard.press("KeyW", { delay: keyTime });
    await page.keyboard.press("KeyE", { delay: keyTime });
    await page.keyboard.press("KeyD", { delay: keyTime });
    await page.keyboard.press("KeyE", { delay: keyTime });
    await page.keyboard.press("KeyS", { delay: keyTime });
    await page.keyboard.press("KeyQ", { delay: keyTime });

    // Screen shot result
    let afterClick = await page.screenshot({
      path: outputFolder + "MoveAround.png",
    });

    //Compare screen shot to valid saved
    expect(afterClick).toMatchImageSnapshot({
      failureThreshold: "0.01",
      failureThresholdType: "percent",
      customSnapshotsDir: `test/service/valid`,
      customSnapshotIdentifier: "MoveAround",
      noColors: false,
    });
  });
});
