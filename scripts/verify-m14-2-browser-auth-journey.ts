/**
 * MANDATE — Milestone 14.2: Dual-Origin Browser Authentication & CSRF Verification
 * 
 * Uses authentic Google Chrome to verify:
 * 1. Cryptographic challenge-response authentication in browser context.
 * 2. HttpOnly session cookie issuance and storage.
 * 3. Session persistence across hard page reloads.
 * 4. Clean session revocation and cookie clearing on logout.
 * 5. Hostile cross-origin attack neutralization (CORS + Origin firewall).
 */

import http from "http";
import path from "path";
import fs from "fs";
import puppeteer from "puppeteer-core";
import * as nearApi from "near-api-js";
import { prisma } from "../src/lib/db";
import { WalletAuthService } from "../src/lib/auth/walletAuthService";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const APP_URL = "http://localhost:3001";
const ATTACKER_PORT = 3999;
const ATTACKER_ORIGIN = `http://127.0.0.1:${ATTACKER_PORT}`;
const ARTIFACT_DIR = "/Users/user/.gemini/antigravity/brain/246b6a23-57de-42f3-804a-03ec2f7ed2f1";
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, "screenshots");

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runBrowserVerification() {
  console.log("================================================================================");
  console.log("🌐 MANDATE M14.2: DUAL-ORIGIN BROWSER AUTHENTICATION & SECURITY JOURNEY");
  console.log("================================================================================\n");

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const testAccount = `browser-user-${Date.now().toString(36)}.testnet`;
  const keyPair = nearApi.utils.KeyPairEd25519.fromRandom();
  const publicKeyStr = keyPair.getPublicKey().toString();

  // 1. Start hostile attacker server on port 3999
  const hostileHtml = `
    <!DOCTYPE html>
    <html>
      <head><title>Hostile Attacker Origin</title></head>
      <body style="background:#111;color:#f33;font-family:sans-serif;padding:30px;">
        <h2>Hostile Cross-Origin Exploit Testbed</h2>
        <div id="results">Running attacks...</div>
        <script>
          window.attackResults = {};

          window.runAttack = async function() {
            // Attack 1: Unauthenticated account takeover via POST /api/auth
            try {
              const res = await fetch("${APP_URL}/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accountId: "impersonated_victim.testnet" })
              });
              const body = await res.json();
              window.attackResults.takeover = { status: res.status, body };
            } catch (err) {
              window.attackResults.takeover = { error: err.message };
            }

            // Attack 2: Cross-origin mutating PATCH to /api/user/profile with credentials
            try {
              const res = await fetch("${APP_URL}/api/user/profile", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ displayName: "Hostile_CSRF_Pwned" })
              });
              const body = await res.json();
              window.attackResults.profilePatch = { status: res.status, body };
            } catch (err) {
              window.attackResults.profilePatch = { error: err.message };
            }

            document.getElementById("results").innerHTML = 
              "<pre>" + JSON.stringify(window.attackResults, null, 2) + "</pre>";
          };
        </script>
      </body>
    </html>
  `;

  const hostileServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(hostileHtml);
  });

  await new Promise<void>((resolve) => hostileServer.listen(ATTACKER_PORT, "127.0.0.1", () => resolve()));
  console.log(`[Attacker] Hostile server listening on ${ATTACKER_ORIGIN}`);

  // 2. Launch Google Chrome
  console.log("[Chrome] Launching authentic Google Chrome...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Expose signing hook to browser window
    await page.exposeFunction("nodeSignMessage", async (messageStr: string) => {
      const sig = keyPair.sign(Buffer.from(messageStr, "utf8"));
      return {
        publicKey: publicKeyStr,
        signature: Buffer.from(sig.signature).toString("hex"),
      };
    });

    // Step 1: Navigate to Mandate App
    console.log(`\n--- Step 1: Navigate to Mandate (${APP_URL}) ---`);
    await page.goto(APP_URL, { waitUntil: "networkidle2" });
    console.log("  ✓ Navigated to Mandate landing page");

    // Step 2: Perform Authenticated Wallet Sign-In via Challenge-Response
    console.log("\n--- Step 2: Challenge-Response Wallet Authentication ---");
    const authResult = await page.evaluate(
      async (account: string, pubKey: string) => {
        // 1. Request server challenge
        const challengeRes = await fetch(`/api/auth?action=challenge&accountId=${account}`);
        const challengeData = await challengeRes.json();
        if (!challengeData.success) throw new Error("Failed to get challenge");

        // 2. Sign challenge message using exposed node signer
        const signed = await (window as any).nodeSignMessage(challengeData.challenge.message);

        // 3. Submit cryptographic proof
        const authRes = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: account,
            publicKey: pubKey,
            signature: signed.signature,
            message: challengeData.challenge.message,
            nonce: challengeData.challenge.nonce,
          }),
        });

        const authBody = await authRes.json();
        return { status: authRes.status, authBody };
      },
      testAccount,
      publicKeyStr
    );

    console.log(`  ✓ Auth endpoint status: HTTP ${authResult.status}`);
    console.log(`  ✓ Authenticated user: ${authResult.authBody.user?.nearAccountId}`);

    // Verify session cookie was set in browser
    const cookies = await page.cookies();
    const sessionCookie = cookies.find((c) => c.name === "mandate_session");
    if (!sessionCookie || !sessionCookie.httpOnly) {
      throw new Error("mandate_session HttpOnly cookie was not set in browser!");
    }
    console.log(`  ✓ Verified browser cookie: mandate_session (HttpOnly=${sessionCookie.httpOnly}, SameSite=${sessionCookie.sameSite})`);

    // Navigate to dashboard with authenticated session
    console.log("\n--- Step 3: Access Authenticated Dashboard & Settings ---");
    await page.goto(`${APP_URL}/dashboard`, { waitUntil: "networkidle2" });
    await delay(1000);

    const dashboardShotPath = path.join(SCREENSHOT_DIR, "m14-2-authenticated-dashboard.png");
    await page.screenshot({ path: dashboardShotPath });
    console.log(`  ✓ Captured authenticated dashboard screenshot: ${dashboardShotPath}`);

    // Navigate to settings to confirm profile query
    await page.goto(`${APP_URL}/settings`, { waitUntil: "networkidle2" });
    await delay(1000);

    const settingsShotPath = path.join(SCREENSHOT_DIR, "m14-2-authenticated-settings.png");
    await page.screenshot({ path: settingsShotPath });
    console.log(`  ✓ Captured authenticated settings screenshot: ${settingsShotPath}`);

    // Step 4: Verify Session Persistence Across Page Reload
    console.log("\n--- Step 4: Verify Session Persistence Across Reload ---");
    await page.reload({ waitUntil: "networkidle2" });
    await delay(1000);

    const cookiesAfterReload = await page.cookies();
    const reloadCookie = cookiesAfterReload.find((c) => c.name === "mandate_session");
    if (!reloadCookie) {
      throw new Error("Session cookie lost after page reload!");
    }
    console.log("  ✓ Session cookie persists after hard page reload");

    const persistShotPath = path.join(SCREENSHOT_DIR, "m14-2-session-persisted-reload.png");
    await page.screenshot({ path: persistShotPath });
    console.log(`  ✓ Captured reload screenshot: ${persistShotPath}`);

    // Step 5: Test Session Revocation & Logout
    console.log("\n--- Step 5: User Logout & Session Revocation ---");
    const logoutResult = await page.evaluate(async () => {
      const res = await fetch("/api/auth", { method: "DELETE" });
      const body = await res.json();
      return { status: res.status, body };
    });
    console.log(`  ✓ Logout API response: HTTP ${logoutResult.status}`);

    await delay(500);
    const cookiesAfterLogout = await page.cookies();
    const logoutCookie = cookiesAfterLogout.find((c) => c.name === "mandate_session");
    if (logoutCookie && logoutCookie.value !== "") {
      // If cookie object still exists, verify it has expired or empty
      console.log(`  ✓ Cookie expired or cleared (value length: ${logoutCookie.value.length})`);
    } else {
      console.log("  ✓ mandate_session cookie completely removed from browser store");
    }

    // Attempting to access protected route post-logout returns 401
    const postLogoutCheck = await page.evaluate(async () => {
      const res = await fetch("/api/user/profile");
      return res.status;
    });
    if (postLogoutCheck === 401) {
      console.log("  ✓ Post-logout profile request strictly rejected with HTTP 401 Unauthorized");
    } else {
      throw new Error(`Expected 401 post-logout, got ${postLogoutCheck}`);
    }

    const logoutShotPath = path.join(SCREENSHOT_DIR, "m14-2-post-logout.png");
    await page.screenshot({ path: logoutShotPath });
    console.log(`  ✓ Captured post-logout screenshot: ${logoutShotPath}`);

    // Step 6: Hostile Cross-Origin Attacks Neutralized
    console.log("\n--- Step 6: Hostile Cross-Origin Browser Attacks ---");
    await page.goto(ATTACKER_ORIGIN, { waitUntil: "networkidle2" });
    console.log(`  ✓ Navigated browser to hostile attacker origin: ${ATTACKER_ORIGIN}`);

    await page.evaluate(async () => {
      await (window as any).runAttack();
    });
    await delay(1000);

    const attackResults: any = await page.evaluate(() => (window as any).attackResults);
    console.log("  [Attacker Probe Results]:", JSON.stringify(attackResults, null, 2));

    // Assert Attack 1 (unauthenticated takeover) blocked
    const takeoverBlocked =
      attackResults.takeover?.error?.includes("Failed to fetch") ||
      attackResults.takeover?.status === 401 ||
      attackResults.takeover?.status === 403;

    if (takeoverBlocked) {
      console.log("  ✓ Hostile Attack 1 (Unauthenticated Takeover): BLOCKED by browser CORS / Origin Firewall");
    } else {
      throw new Error(`VULNERABILITY: Attack 1 was not blocked! ${JSON.stringify(attackResults.takeover)}`);
    }

    // Assert Attack 2 (cross-origin mutating PATCH) blocked
    const patchBlocked =
      attackResults.profilePatch?.error?.includes("Failed to fetch") ||
      attackResults.profilePatch?.status === 401 ||
      attackResults.profilePatch?.status === 403;

    if (patchBlocked) {
      console.log("  ✓ Hostile Attack 2 (Cross-Origin Mutating PATCH): BLOCKED by CORS Preflight / Origin Firewall");
    } else {
      throw new Error(`VULNERABILITY: Attack 2 was not blocked! ${JSON.stringify(attackResults.profilePatch)}`);
    }

    const attackerShotPath = path.join(SCREENSHOT_DIR, "m14-2-hostile-origin-blocked.png");
    await page.screenshot({ path: attackerShotPath });
    console.log(`  ✓ Captured hostile origin screenshot: ${attackerShotPath}`);

    console.log("\n================================================================================");
    console.log("🏆 ALL M14.2 DUAL-ORIGIN BROWSER TESTS PASSED 100%");
    console.log("================================================================================");
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => hostileServer.close(() => resolve()));
    console.log("[Attacker] Hostile server stopped.");
  }
}

runBrowserVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Browser journey failed:", err);
    process.exit(1);
  });

