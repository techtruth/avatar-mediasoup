//import { log } from "console";
const fs = require("fs");
const { toMatchImageSnapshot } = require("jest-image-snapshot");
const { installMouseHelper, saveConsole } = require("./testHelpers");

//Create directory to run the systems test
const outputFolder = "test/Vizreg-Test" + Date.now() + "/";
if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder);
}

jest.setTimeout(60000);

describe("Example Tests", () => {
  beforeAll(async () => {
    expect.extend({ toMatchImageSnapshot });

    //Make mouse visible
    installMouseHelper(page);

    //Save console log to file
    page.on("console", (msg) => saveConsole(outputFolder, msg));

    //Configure puppeteer page
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setDefaultNavigationTimeout(0);

    //Navigate to a frame page
    //await page.goto("https://dev.framevr.io/unittest");
    await page.goto("http://localhost:8080/unittest");
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
      customSnapshotsDir: `test/vizreg/valid`,
      customSnapshotIdentifier: "CheckConnectButton",
      noColors: false,
    });
  });

  test("Click Connect button", async () => {
    // Click connect button
    await page.mouse.click(875, 600, { button: "left" });

    await page.waitForTimeout(5000); //Wait 5 seconds until it is ready

    // Screen shot result
    let afterClick = await page.screenshot({
      path: outputFolder + "ClickConnectButton.png",
    });

    //Compare screen shot to valid saved
    expect(afterClick).toMatchImageSnapshot({
      failureThreshold: "0.01",
      failureThresholdType: "percent",
      customSnapshotsDir: `test/vizreg/valid`,
      customSnapshotIdentifier: "ClickConnectButton",
      noColors: false,
    });
  });

  test("Sidebar button", async () => {
    await page.mouse.click(1880, 35, { button: "left" }); //Open sidebar

    await page.waitForTimeout(5000); //Wait 5 seconds until it is ready

    // Screen shot result
    let afterClick = await page.screenshot({
      path: outputFolder + "ClickSidebarButton.png",
    });

    //Compare screen shot to valid saved
    expect(afterClick).toMatchImageSnapshot({
      failureThreshold: "0.01",
      failureThresholdType: "percent",
      customSnapshotsDir: `test/vizreg/valid`,
      customSnapshotIdentifier: "ClickSidebarButton",
      noColors: false,
    });

    await page.mouse.click(1880, 35, { button: "left" }); //Close sidebar
  });

  test("People menu button", async () => {
    await page.mouse.click(64, 32, { button: "left" }); //Open people menu

    await page.waitForTimeout(5000); //Wait 5 seconds until it is ready

    // Screen shot result
    let afterClick = await page.screenshot({
      path: outputFolder + "ClickPeopleMenuButton.png",
    });

    //Compare screen shot to valid saved
    expect(afterClick).toMatchImageSnapshot({
      failureThreshold: "0.01",
      failureThresholdType: "percent",
      customSnapshotsDir: `test/vizreg/valid`,
      customSnapshotIdentifier: "ClickPeopleMenuButton",
      noColors: false,
    });

    await page.mouse.click(64, 32, { button: "left" }); //Close people menu
  });

  test("Chat menu button", async () => {
    await page.mouse.click(256, 32, { button: "left" }); //Open chat menu

    await page.waitForTimeout(5000); //Wait 5 seconds until it is ready

    // Screen shot result
    let afterClick = await page.screenshot({
      path: outputFolder + "ClickChatMenuButton.png",
    });

    //Compare screen shot to valid saved
    expect(afterClick).toMatchImageSnapshot({
      failureThreshold: "0.01",
      failureThresholdType: "percent",
      customSnapshotsDir: `test/vizreg/valid`,
      customSnapshotIdentifier: "ClickChatMenuButton",
      noColors: false,
    });

    await page.mouse.click(256, 32, { button: "left" }); //Close chat menu
  });

  test("GOTO menu button", async () => {
    await page.mouse.click(384, 32, { button: "left" }); //Open GOTO menu

    await page.waitForTimeout(5000); //Wait 5 seconds until it is ready

    // Screen shot result
    let afterClick = await page.screenshot({
      path: outputFolder + "ClickGOTOMenuButton.png",
    });

    //Compare screen shot to valid saved
    expect(afterClick).toMatchImageSnapshot({
      failureThreshold: "0.01",
      failureThresholdType: "percent",
      customSnapshotsDir: `test/vizreg/valid`,
      customSnapshotIdentifier: "ClickGOTOMenuButton",
      noColors: false,
    });

    await page.mouse.click(384, 32, { button: "left" }); //Close GOTO menu
  });

  test("Send text chat", async () => {
    await page.mouse.click(256, 32, { button: "left" }); //Open chat menu

    await page.waitForTimeout(5000); //Wait 5 seconds until it is ready

    await page.mouse.click(256, 460, { button: "left" }); //Click chat text input

    await page.type("#canvasParentDiv", "UNITBOT1", { delay: 100 });

    await page.mouse.click(535, 460, { button: "left" }); //Click chat send button

    // Screen shot result
    let afterClick = await page.screenshot({
      path: outputFolder + "SendChatMessage.png",
    });

    //Compare screen shot to valid saved
    expect(afterClick).toMatchImageSnapshot({
      failureThreshold: "0.01",
      failureThresholdType: "percent",
      customSnapshotsDir: `test/vizreg/valid`,
      customSnapshotIdentifier: "SendChatMessage",
      noColors: false,
    });

    await page.mouse.click(256, 32, { button: "left" }); //Close chat menu
  });
});
