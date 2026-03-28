const fs = require("node:fs/promises");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const CDP_BASE = process.env.CDP_BASE || "http://127.0.0.1:9223";
const PAGE_URL = process.env.PAGE_URL || "http://127.0.0.1:8768/";
const OUT_DIR = process.env.OUT_DIR || path.join("docs", "images");

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error.message));
        else pending.resolve(msg.result || {});
        return;
      }

      for (const listener of [...this.listeners]) {
        listener(msg);
      }
    });

    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(), { once: true });
      this.ws.addEventListener("error", (event) => reject(event.error || new Error("WebSocket error")), {
        once: true,
      });
    });
  }

  async close() {
    if (!this.ws) return;
    this.ws.close();
    await new Promise((resolve) => {
      this.ws.addEventListener("close", () => resolve(), { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  waitForEvent(method, { timeoutMs = 15000, predicate = () => true } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      const listener = (msg) => {
        if (msg.method !== method) return;
        if (!predicate(msg.params || {})) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(msg.params || {});
      };

      this.listeners.add(listener);
    });
  }
}

async function getWsUrl() {
  const response = await fetch(`${CDP_BASE}/json/list`);
  if (!response.ok) {
    throw new Error(`Failed to query CDP targets: ${response.status}`);
  }
  const targets = await response.json();
  const page = targets.find((target) => target.type === "page");
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error("No debuggable page target found");
  }
  return page.webSocketDebuggerUrl;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result?.value;
}

function toClip(rect) {
  return {
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height),
    scale: 1,
  };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const wsUrl = await getWsUrl();
  const cdp = new CdpClient(wsUrl);
  await cdp.connect();

  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1720,
      height: 2800,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1720,
      screenHeight: 2800,
    });
    await cdp.send("Emulation.setDefaultBackgroundColorOverride", {
      color: { r: 255, g: 255, b: 255, a: 1 },
    });

    await cdp.send("Page.navigate", { url: PAGE_URL });
    await cdp.waitForEvent("Page.loadEventFired");
    await delay(2500);

    await evaluate(
      cdp,
      `(() => new Promise(async (resolve, reject) => {
        try {
          const response = await fetch("wafer_data_backup.json");
          const data = await response.json();
          const demoName = "Demo-361P-A";
          const demoText = data.thk[demoName];
          if (!demoText) throw new Error("Demo data not found");

          document.getElementById("xyPatternSelect").value = "361P";
          document.getElementById("w1Input").value = demoText;
          document.getElementById("w2Input").value = "";
          document.getElementById("thkName1").value = demoName;
          document.getElementById("thkName2").value = "";

          processData();

          document.getElementById("showLabels").checked = false;
          toggleLabels();
          document.getElementById("colorscaleSelect").value = "Jet";
          updateColorscale();
          document.getElementById("contourLevels").value = 80;
          updateContourLevels();
          document.getElementById("lineType").value = "circumference";
          plotLineProfile();

          setTimeout(resolve, 2500);
        } catch (error) {
          reject(error);
        }
      }))()`
    );

    const scrollHeight = await evaluate(
      cdp,
      `Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))`
    );
    const targetHeight = Math.max(2200, Math.min(scrollHeight + 80, 3600));

    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1720,
      height: targetHeight,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1720,
      screenHeight: targetHeight,
    });
    await delay(400);

    const rects = await evaluate(
      cdp,
      `(() => {
        const pad = 16;
        const mapCard = document.getElementById("waferPlot").closest(".card").getBoundingClientRect();
        const lineCard = document.getElementById("lineCard").getBoundingClientRect();
        return {
          map: {
            x: mapCard.x - pad,
            y: mapCard.y - pad,
            width: mapCard.width + pad * 2,
            height: mapCard.height + pad * 2
          },
          line: {
            x: lineCard.x - pad,
            y: lineCard.y - pad,
            width: lineCard.width + pad * 2,
            height: lineCard.height + pad * 2
          }
        };
      })()`
    );

    const mapShot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      clip: toClip(rects.map),
    });
    const lineShot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      clip: toClip(rects.line),
    });

    await fs.writeFile(
      path.join(OUT_DIR, "demo-361p-thickness.png"),
      Buffer.from(mapShot.data, "base64")
    );
    await fs.writeFile(
      path.join(OUT_DIR, "demo-361p-line-profile.png"),
      Buffer.from(lineShot.data, "base64")
    );

    console.log("Generated screenshots:");
    console.log(path.join(OUT_DIR, "demo-361p-thickness.png"));
    console.log(path.join(OUT_DIR, "demo-361p-line-profile.png"));
  } finally {
    await cdp.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
