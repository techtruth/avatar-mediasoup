/**
 * This function will be serialized and injected into the page context, so it
 * needs to be a pure function.
 *
 * @author Jesús Leganés-Combarro 'piranna' <piranna@gmail.com>
 * @date 2021-10-15
 * @returns
 */
const fs = require("fs");

function onNewDocument() {
  // Install mouse helper only for top-level frame.
  if (window !== window.parent) {
    return;
  }

  const innerHTML = `
  puppeteer-mouse-pointer {
    pointer-events: none;
    position: absolute;
    top: 0;
    z-index: 10000;
    left: 0;
    width: 20px;
    height: 20px;
    background: rgba(0,0,0,.4);
    border: 1px solid white;
    border-radius: 10px;
    margin: -10px 0 0 -10px;
    padding: 0;
    transition: background .2s, border-radius .2s, border-color .2s;
  }
  puppeteer-mouse-pointer.button-1 {
    transition: none;
    background: rgba(0,0,0,0.9);
  }
  puppeteer-mouse-pointer.button-2 {
    transition: none;
    border-color: rgba(0,0,255,0.9);
  }
  puppeteer-mouse-pointer.button-3 {
    transition: none;
    border-radius: 4px;
  }
  puppeteer-mouse-pointer.button-4 {
    transition: none;
    border-color: rgba(255,0,0,0.9);
  }
  puppeteer-mouse-pointer.button-5 {
    transition: none;
    border-color: rgba(0,255,0,0.9);
  }
  `;

  window.addEventListener("DOMContentLoaded", () => {
    const styleElement = document.createElement("style");
    styleElement.innerHTML = innerHTML;
    document.head.appendChild(styleElement);

    const box = document.createElement("puppeteer-mouse-pointer");
    document.body.appendChild(box);

    document.addEventListener(
      "mousemove",
      (event) => {
        box.style.left = event.pageX + "px";
        box.style.top = event.pageY + "px";
        updateButtons(event.buttons);
      },
      true
    );
    document.addEventListener(
      "mousedown",
      (event) => {
        updateButtons(event.buttons);
        box.classList.add("button-" + event.which);
      },
      true
    );
    document.addEventListener(
      "mouseup",
      (event) => {
        updateButtons(event.buttons);
        box.classList.remove("button-" + event.which);
      },
      true
    );

    function updateButtons(buttons) {
      for (let i = 0; i < 5; i++) {
        box.classList.toggle("button-" + i, buttons & (1 << i));
      }
    }
  });
}

/**
 * Injects a box into the page that moves with the mouse
 *
 * Useful for debugging
 */
exports.installMouseHelper = async function installMouseHelper(page) {
  await page.evaluateOnNewDocument(onNewDocument);
};

exports.jsContextDescribe = function (jsHandle) {
  return jsHandle.executionContext().evaluate((obj) => {
    // serialize |obj| however you want
    //let json = obj.jsonValue();
    //return `OBJ: ${typeof obj}, ${json}`;

    switch (typeof obj) {
      case "string":
      case "number":
        return obj;
      case "object":
        if (Array.isArray(obj)) {
          return "ARRAY";
        } else {
          return obj.getProperties();
        }
      default:
        return typeof obj;
    }
  }, jsHandle);
};

exports.saveConsole = async (logdirectory, msg) => {
  //If this throws errors, before end add await page.waitForTimeout(1000);
  let savedArgs;
  switch (msg.type()) {
    case "info":
    case "log":
    case "warning":
      savedArgs = msg.args();
      fs.appendFileSync(logdirectory + "output.log", "\n");
      for (var i = 0; i < msg.args().length; i++) {
        try {
          //console.log("LOL ARS", await savedArgs[i].jsonValue());
          let resolved = await savedArgs[i].jsonValue();
          fs.appendFileSync(logdirectory + "output.log", resolved + " ");
        } catch (error) {
          console.error("Error logging to output.log:", error, savedArgs[i]);
        }
      }
      fs.appendFileSync(logdirectory + "output.log", "\n");
      break;
    case "error":
      fs.appendFileSync(logdirectory + "error.log", msg.text() + "\n");
      break;
    case "debug":
      try {
        let args = await Promise.all(msg.args().map((arg) => arg.jsonValue()));
        fs.appendFileSync(logdirectory + "debug.log", "\n");
        for (var k = 0; k < args.length; k++) {
          switch (typeof args[k]) {
            case "string":
              fs.appendFileSync(logdirectory + "debug.log", args[k] + " ");
              break;
            case "number":
              fs.appendFileSync(
                logdirectory + "debug.log",
                args[k].toString() + " "
              );
              break;
            case "object":
              fs.appendFileSync(
                logdirectory + "debug.log",
                JSON.stringify(args[k], null, 1)
              );
              break;
          }
        }
      } catch (err) {
        //console.log("Debug Message:", msg.text());
      }
      break;
    case "verbose":
      console.log("Verbose Message:", msg.text());
      break;
    default:
      console.log("Unknown message type:", msg.type());
  }
};
