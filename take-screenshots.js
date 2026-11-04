const { execSync } = require("child_process");
const fs = require("fs");

// We can take screenshots using Chrome CLI
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Helper to run headless chrome
function capture(url, outFile, width = 1280, height = 900) {
  const cmd = `"${chrome}" --headless --screenshot="${outFile}" --window-size=${width},${height} --hide-scrollbars "${url}"`;
  console.log(`Capturing ${url} -> ${outFile}`);
  execSync(cmd, { stdio: "inherit" });
}

capture("http://localhost:3001", "shots-landing-dark.png", 1280, 1200);
capture("http://localhost:3001/dashboard", "shots-dashboard-dark.png", 1280, 1000);
capture("http://localhost:3001/docs", "shots-docs-dark.png", 1280, 1100);
console.log("Done capturing initial dark shots");
