const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");

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
  const tmpDir = `/tmp/chrome-test-${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  const proc = spawn(
    chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${tmpDir}`,
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,1000",
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

    async function takeLightShot(url, outFile) {
      await send("Page.navigate", { url });
      await sleep(1800);

      await send("Runtime.evaluate", {
        expression: `
          localStorage.setItem('mandate_theme', 'light');
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
          document.documentElement.setAttribute('data-theme', 'light');
        `,
      });
      await sleep(600);

      const shot = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(outFile, Buffer.from(shot.data, "base64"));
      console.log(`Saved ${outFile}`);
    }

    await takeLightShot("http://localhost:3001", "shots-landing-light.png");
    await takeLightShot("http://localhost:3001/dashboard", "shots-dashboard-light.png");
    await takeLightShot("http://localhost:3001/docs", "shots-docs-light.png");

    // Phone section
    await send("Page.navigate", { url: "http://localhost:3001" });
    await sleep(1800);
    await send("Runtime.evaluate", {
      expression: `
        localStorage.setItem('mandate_theme', 'light');
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.documentElement.setAttribute('data-theme', 'light');
        const el = document.querySelector('.phone-3d');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
      `,
    });
    await sleep(600);
    const phoneShot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("shots-phone-light.png", Buffer.from(phoneShot.data, "base64"));
    console.log("Saved shots-phone-light.png");

    // Modal
    await send("Page.navigate", { url: "http://localhost:3001/dashboard" });
    await sleep(1800);
    await send("Runtime.evaluate", {
      expression: `
        localStorage.setItem('mandate_theme', 'light');
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.documentElement.setAttribute('data-theme', 'light');
        const btns = Array.from(document.querySelectorAll('button'));
        const fundBtn = btns.find(b => b.textContent && b.textContent.includes('Fund Agent'));
        if (fundBtn) fundBtn.click();
      `,
    });
    await sleep(800);
    const modalShot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync("shots-modal-light.png", Buffer.from(modalShot.data, "base64"));
    console.log("Saved shots-modal-light.png");

    ws.close();
  } finally {
    proc.kill();
  }
}

run().catch(console.error);
