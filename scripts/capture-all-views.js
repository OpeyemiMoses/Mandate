const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9222;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

async function run() {
  const tmpDir = `/tmp/chrome-capture-${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  const proc = spawn(
    chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${tmpDir}`,
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,1100",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  await sleep(1500);

  try {
    const list = await getJson(`http://127.0.0.1:${port}/json/list`);
    const page = list[0];
    if (!page || !page.webSocketDebuggerUrl) {
      throw new Error("No page found");
    }

    const WebSocket = require("ws");
    const ws = new WebSocket(page.webSocketDebuggerUrl);

    let id = 1;
    const callbacks = new Map();

    ws.on("message", (msg) => {
      const data = JSON.parse(msg);
      if (callbacks.has(data.id)) {
        const { resolve, reject } = callbacks.get(data.id);
        callbacks.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    });

    await new Promise((res) => ws.on("open", res));

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const reqId = id++;
        callbacks.set(reqId, { resolve, reject });
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    }

    await send("Page.enable");
    await send("Runtime.enable");

    async function captureView(url, outFile, theme = "dark", action = null) {
      console.log(`Navigating to ${url} (${theme})...`);
      await send("Page.navigate", { url });
      await sleep(2000);

      await send("Runtime.evaluate", {
        expression: `
          localStorage.setItem('mandate_theme', '${theme}');
          document.documentElement.classList.remove('dark', 'light');
          document.documentElement.classList.add('${theme}');
          document.documentElement.setAttribute('data-theme', '${theme}');
        `,
      });
      await sleep(500);

      if (action) {
        await send("Runtime.evaluate", { expression: action });
        await sleep(600);
      }

      const shot = await send("Page.captureScreenshot", { format: "png" });
      const buf = Buffer.from(shot.data, "base64");
      fs.writeFileSync(outFile, buf);
      console.log(`Saved ${outFile} (${buf.length} bytes)`);
    }

    // 1. Landing Light
    await captureView("http://localhost:3001", "shots-landing-light.png", "light");
    // 2. Landing Phone section Light
    await captureView(
      "http://localhost:3001",
      "shots-phone-light.png",
      "light",
      `const el = document.querySelector('.phone-3d'); if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });`
    );
    // 3. Docs Light
    await captureView("http://localhost:3001/docs", "shots-docs-light.png", "light");
    // 4. Dashboard Light
    await captureView("http://localhost:3001/dashboard", "shots-dashboard-light.png", "light");
    // 5. Dashboard Dark
    await captureView("http://localhost:3001/dashboard", "shots-dashboard-dark.png", "dark");
    // 6. Fund Modal Centered
    await captureView(
      "http://localhost:3001/dashboard",
      "shots-modal-dark.png",
      "dark",
      `const btns = Array.from(document.querySelectorAll('button')); const b = btns.find(x => x.textContent && x.textContent.includes('Fund Agent')); if (b) b.click();`
    );

    ws.close();
  } finally {
    proc.kill();
  }
}

run().catch(console.error);
