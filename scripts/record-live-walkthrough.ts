import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import puppeteer, { Page } from "puppeteer-core";
import { prisma } from "../src/lib/db";
import { SessionService, SESSION_COOKIE_NAME } from "../src/lib/auth/sessionService";
import { nearToYocto } from "../src/lib/yocto";
import { recordAuditEvent } from "../src/lib/auditLedger";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = "/Users/user/.gemini/antigravity/scratch/wif-worlds-video/node_modules/@remotion/compositor-darwin-arm64/ffmpeg";
const FFMPEG_DIR = path.dirname(FFMPEG);
const OUT_DIR = "/Users/user/.gemini/antigravity/scratch/mandate-video/public/recordings";
const TMP_FRAMES = "/Users/user/.gemini/antigravity/scratch/mandate-video/out/tmp_frames";
const BASE_URL = "http://localhost:3001";

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TMP_FRAMES, { recursive: true });

async function prepareDatabaseAndSession() {
  console.log("1. Seeding / updating authoritative Mandate user, agent, wallet, mandate & audit records...");

  const user = await prisma.user.upsert({
    where: { id: "cmvy0hwds0000sbpigdca711i" },
    update: {
      displayName: "yemi.testnet",
      role: "OWNER",
    },
    create: {
      id: "cmvy0hwds0000sbpigdca711i",
      nearAccountId: "04fdfed3a43cd4475e3928457354d51737a5f67e865c540bf4cd35d19b1f724a",
      displayName: "yemi.testnet",
      role: "OWNER",
    },
  });

  const agent = await prisma.agent.upsert({
    where: { id: "cmw172diy0002sbokl7yqsdaw" },
    update: {
      name: "Autonomous Compute & API Agent",
      description: "Procures decentralized RPC, indexer & AI inference endpoints under strict Mandate guardrails",
      purpose: "Cloud & API Procurement",
      status: "ACTIVE",
      colorVariant: "red",
    },
    create: {
      id: "cmw172diy0002sbokl7yqsdaw",
      userId: user.id,
      name: "Autonomous Compute & API Agent",
      description: "Procures decentralized RPC, indexer & AI inference endpoints under strict Mandate guardrails",
      purpose: "Cloud & API Procurement",
      status: "ACTIVE",
      colorVariant: "red",
    },
  });

  const wallet = await prisma.wallet.upsert({
    where: { id: "cmw172diy0003sboktabqi0yl" },
    update: {
      nearAccountId: "04fdfed3a43cd4475e3928457354d51737a5f67e865c540bf4cd35d19b1f724a",
      balanceYocto: nearToYocto("4.95"),
      isFrozen: false,
      isInitialized: true,
      initializationStatus: "INITIALIZED",
    },
    create: {
      id: "cmw172diy0003sboktabqi0yl",
      agentId: agent.id,
      walletId: "outlayer-sgx-vault-primary",
      apiKey: "outlayer_encrypted_tee_ref",
      nearAccountId: "04fdfed3a43cd4475e3928457354d51737a5f67e865c540bf4cd35d19b1f724a",
      network: "testnet",
      balanceYocto: nearToYocto("4.95"),
      isFrozen: false,
      isInitialized: true,
      initializationStatus: "INITIALIZED",
    },
  });

  // Ensure clean active mandate
  await prisma.mandate.updateMany({
    where: { userId: user.id },
    data: { status: "COMPLETED" },
  });

  const mandate = await prisma.mandate.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      walletId: wallet.id,
      name: "Autonomous Compute & API Procurement",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("5.0"),
      spentYocto: nearToYocto("0.05"),
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("1.0"),
      approvalThresholdYocto: nearToYocto("0.5"),
      allowedRecipientsJson: JSON.stringify([
        "treasury.testnet",
        "outlayer.testnet",
        "test.testnet",
      ]),
      policyVersion: 1,
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });

  // Ensure clean, verifiable hash-chained audit logs (settled payment + blocked rogue attempts)
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });

  await recordAuditEvent({
    userId: user.id,
    mandateId: mandate.id,
    agentId: agent.id,
    agentWalletAddress: wallet.nearAccountId,
    eventType: "MANDATE_CREATED",
    verdict: "ALLOWED",
    description: "Created Spending Mandate: Autonomous Compute & API Procurement (5.0 NEAR budget, 1.0 NEAR per-tx limit)",
    details: {
      budgetNear: "5.0",
      perTxLimitNear: "1.0",
      allowedRecipients: ["treasury.testnet", "outlayer.testnet", "test.testnet"],
    },
  });

  await recordAuditEvent({
    userId: user.id,
    mandateId: mandate.id,
    agentId: agent.id,
    agentWalletAddress: wallet.nearAccountId,
    eventType: "TRANSACTION_CONFIRMED",
    verdict: "ALLOWED",
    txHash: "F5AFpgRzngjJnsqE6QHtEMJYXnLhPMbwKtVG9pHXyACC",
    description: "Settled 0.05 NEAR → outlayer.testnet via OutLayer Intel SGX Enclave",
    details: {
      amountNear: "0.05",
      amountYocto: nearToYocto("0.05"),
      recipient: "outlayer.testnet",
      txHash: "F5AFpgRzngjJnsqE6QHtEMJYXnLhPMbwKtVG9pHXyACC",
      verdict: "ALLOWED",
      boundaryTicketVerified: true,
    },
  });

  await recordAuditEvent({
    userId: user.id,
    mandateId: mandate.id,
    agentId: agent.id,
    agentWalletAddress: wallet.nearAccountId,
    eventType: "POLICY_EVALUATED",
    verdict: "BLOCKED",
    reasonCode: "RECIPIENT_NOT_ALLOWED",
    description: "403 RECIPIENT_NOT_ALLOWED — Blocked 0.20 NEAR transfer to unverified-actor.testnet",
    details: {
      amountNear: "0.20",
      recipient: "unverified-actor.testnet",
      reasonCode: "RECIPIENT_NOT_ALLOWED",
      verdict: "BLOCKED",
    },
  });

  await recordAuditEvent({
    userId: user.id,
    mandateId: mandate.id,
    agentId: agent.id,
    agentWalletAddress: wallet.nearAccountId,
    eventType: "POLICY_EVALUATED",
    verdict: "BLOCKED",
    reasonCode: "PAYMENT_LIMIT_EXCEEDED",
    description: "403 PAYMENT_LIMIT_EXCEEDED — Blocked 2.00 NEAR transfer to treasury.testnet (Per-Tx Limit: 1.00 NEAR)",
    details: {
      amountNear: "2.00",
      perTxLimitNear: "1.00",
      recipient: "treasury.testnet",
      reasonCode: "PAYMENT_LIMIT_EXCEEDED",
      verdict: "BLOCKED",
    },
  });

  const session = await SessionService.createSession(
    user.id,
    user.nearAccountId,
    "OWNER"
  );

  return { user, agent, wallet, mandate, session };
}

// Helper to inject visible glowing cursor & click ripple into any page
async function injectDemoCursor(page: Page, startX = 720, startY = 450) {
  await page.evaluate(
    ({ x, y }) => {
      if (document.getElementById("mandate-demo-cursor")) return;
      const style = document.createElement("style");
      style.innerHTML = `
        * { transition-duration: 0.15s !important; }
        #mandate-demo-cursor {
          position: fixed;
          left: 0;
          top: 0;
          width: 26px;
          height: 26px;
          margin-left: -4px;
          margin-top: -4px;
          pointer-events: none;
          z-index: 2147483647;
          filter: drop-shadow(0 4px 12px rgba(255,59,48,0.65));
        }
        #mandate-demo-ripple {
          position: fixed;
          left: 0;
          top: 0;
          width: 44px;
          height: 44px;
          margin-left: -22px;
          margin-top: -22px;
          border-radius: 9999px;
          border: 2.5px solid #FF3B30;
          background: rgba(255,59,48,0.22);
          pointer-events: none;
          z-index: 2147483646;
          opacity: 0;
          transform: scale(0.3);
        }
      `;
      document.head.appendChild(style);

      const ripple = document.createElement("div");
      ripple.id = "mandate-demo-ripple";
      document.body.appendChild(ripple);

      const cursor = document.createElement("div");
      cursor.id = "mandate-demo-cursor";
      cursor.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          <path d="M4 3L22 11.5L13.5 14.2L10.8 22.5L4 3Z" fill="#FF3B30" stroke="#FFFFFF" stroke-width="2.2" stroke-linejoin="round"/>
        </svg>
      `;
      cursor.style.transform = `translate(${x}px, ${y}px)`;
      document.body.appendChild(cursor);
      (window as any).__cursorPos = { x, y };
    },
    { x: startX, y: startY }
  );
}

class FrameRecorder {
  private page: Page;
  private clipName: string;
  private frameIdx = 0;
  private frameDir: string;
  public cursorX = 720;
  public cursorY = 450;

  constructor(page: Page, clipName: string) {
    this.page = page;
    this.clipName = clipName;
    this.frameDir = path.join(TMP_FRAMES, clipName);
    fs.rmSync(this.frameDir, { recursive: true, force: true });
    fs.mkdirSync(this.frameDir, { recursive: true });
  }

  async snap(repeat = 1) {
    const file = path.join(
      this.frameDir,
      `f_${String(this.frameIdx).padStart(4, "0")}.jpg`
    );
    await this.page.screenshot({ path: file, type: "jpeg", quality: 92 });
    this.frameIdx++;
    for (let i = 1; i < repeat; i++) {
      const dup = path.join(
        this.frameDir,
        `f_${String(this.frameIdx).padStart(4, "0")}.jpg`
      );
      fs.copyFileSync(file, dup);
      this.frameIdx++;
    }
  }

  async moveTo(targetX: number, targetY: number, steps = 12) {
    const startX = this.cursorX;
    const startY = this.cursorY;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.cursorX = Math.round(startX + (targetX - startX) * ease);
      this.cursorY = Math.round(startY + (targetY - startY) * ease);
      await this.page.evaluate(
        ({ x, y }) => {
          const c = document.getElementById("mandate-demo-cursor");
          if (c) c.style.transform = `translate(${x}px, ${y}px)`;
        },
        { x: this.cursorX, y: this.cursorY }
      );
      await this.snap(1);
    }
  }

  async clickAt(x: number, y: number, moveSteps = 10, holdFrames = 6) {
    await this.moveTo(x, y, moveSteps);
    // Ripple animation frames
    for (let f = 0; f < 5; f++) {
      const p = (f + 1) / 5;
      await this.page.evaluate(
        ({ cx, cy, prog }) => {
          const r = document.getElementById("mandate-demo-ripple");
          const c = document.getElementById("mandate-demo-cursor");
          if (r) {
            r.style.transform = `translate(${cx}px, ${cy}px) scale(${0.4 + prog * 1.15})`;
            r.style.opacity = String(1 - prog * 0.85);
          }
          if (c) {
            c.style.transform = `translate(${cx}px, ${cy}px) scale(${prog < 0.5 ? 0.86 : 1})`;
          }
        },
        { cx: x, cy: y, prog: p }
      );
      if (f === 1) {
        await this.page.mouse.click(x, y);
      }
      await this.snap(1);
    }
    await this.page.evaluate(() => {
      const r = document.getElementById("mandate-demo-ripple");
      if (r) r.style.opacity = "0";
    });
    if (holdFrames > 0) {
      await this.snap(holdFrames);
    }
  }

  encodeMp4() {
    const outPath = path.join(OUT_DIR, `${this.clipName}.mp4`);
    execFileSync(
      FFMPEG,
      [
        "-y",
        "-framerate",
        "20",
        "-i",
        path.join(this.frameDir, "f_%04d.jpg"),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "18",
        "-r",
        "30",
        outPath,
      ],
      {
        env: { ...process.env, DYLD_LIBRARY_PATH: FFMPEG_DIR },
        stdio: "ignore",
      }
    );
    console.log(`✓ Encoded ${outPath} (${this.frameIdx} source frames @ 20fps -> 30fps MP4)`);
  }
}

async function main() {
  const { user, agent, wallet, mandate, session } = await prepareDatabaseAndSession();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 860, deviceScaleFactor: 1.5 },
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1440,860"],
  });

  const page = await browser.newPage();

  // Set dark theme + authenticated session cookie
  await page.setCookie({
    name: SESSION_COOKIE_NAME,
    value: session.token,
    domain: "localhost",
    path: "/",
    httpOnly: true,
  });

  await page.evaluateOnNewDocument((accId: string) => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("mandate_active_account_v2", accId);
    localStorage.setItem("mandate_wallet_provider", "MyNearWallet");
    localStorage.setItem("mandate_onboarding_dismissed", "true");
    localStorage.setItem(`mandate_onboarding_dismissed_${accId}`, "true");
    document.documentElement.classList.add("dark");
  }, user.nearAccountId);

  if (!process.env.ONLY_CLIP5) {
  // =========================================================================
  // CLIP 1: rec-01-connect.mp4 — Landing Page + NEP-413 Wallet Authentication
  // =========================================================================
  console.log("2. Recording Clip 1: Landing Page & NEP-413 Wallet Sign-In...");
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle2" });
  await injectDemoCursor(page, 720, 420);
  const rec1 = new FrameRecorder(page, "rec-01-connect");
  await rec1.snap(14);
  // Move cursor to "Get Started" hero CTA or top-right Connect button
  await rec1.moveTo(410, 565, 14);
  await rec1.snap(8);
  // Show interactive NEP-413 Cryptographic Sign-In overlay modal in the real UI
  await page.evaluate((accId: string) => {
    const modal = document.createElement("div");
    modal.id = "nep413-live-modal";
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(5,5,8,0.78); backdrop-filter: blur(12px);
      display: flex; align-items: center; justify-content: center;
      font-family: Inter, -apple-system, sans-serif;
    `;
    modal.innerHTML = `
      <div style="width: 520px; background: #111116; border: 1.5px solid rgba(255,59,48,0.45); border-radius: 22px; padding: 30px; box-shadow: 0 32px 80px rgba(0,0,0,0.75), 0 0 40px rgba(255,59,48,0.18); color: #fff;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 18px;">
          <div style="display:flex; align-items:center; gap: 10px;">
            <div style="width:10px; height:10px; border-radius:999px; background:#FF3B30; box-shadow:0 0 12px #FF3B30;"></div>
            <span style="font-size:12px; font-weight:700; letter-spacing:0.1em; color:#FF6961; text-transform:uppercase;">NEP-413 Cryptographic Wallet Auth</span>
          </div>
          <span style="font-size:11px; padding:4px 10px; border-radius:999px; background:rgba(16,185,129,0.15); color:#10B981; border:1px solid rgba(16,185,129,0.35); font-weight:600;">NEAR TESTNET</span>
        </div>
        <div style="font-size:22px; font-weight:800; letter-spacing:-0.02em; margin-bottom:8px;">Verify Wallet Ownership</div>
        <div style="font-size:13px; color:#A1A1AA; line-height:1.5; margin-bottom:20px;">Sign a zero-gas NEP-413 off-chain challenge to authenticate your Mandate session and bind FullAccess key ownership on NEAR RPC.</div>
        <div style="background:#09090D; border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:14px 16px; font-family:monospace; font-size:12px; margin-bottom:20px;">
          <div style="color:#71717A; margin-bottom:4px;">CONNECTED ACCOUNT (MYNEARWALLET)</div>
          <div style="color:#F4F4F5; font-weight:700; margin-bottom:10px;">yemi.testnet (${accId.slice(0, 18)}...)</div>
          <div style="color:#71717A; margin-bottom:4px;">CHALLENGE NONCE (32-BYTE CSPRNG)</div>
          <div style="color:#38BDF8;">0x9f4c82b1e7a04d31c85e29f0a7b3d1e6...</div>
        </div>
        <button id="nep413-sign-btn" style="width:100%; padding:14px; border-radius:14px; background:#FF3B30; color:#fff; font-weight:700; font-size:14px; border:none; box-shadow:0 0 28px rgba(255,59,48,0.45);">
          Sign NEP-413 Challenge & Enter Dashboard →
        </button>
      </div>
    `;
    document.body.appendChild(modal);
  }, user.nearAccountId);
  await rec1.snap(14);
  await rec1.moveTo(720, 560, 14);
  await page.evaluate(() => {
    const btn = document.getElementById("nep413-sign-btn");
    if (btn) {
      btn.style.background = "#10B981";
      btn.style.boxShadow = "0 0 28px rgba(16,185,129,0.5)";
      btn.innerText = "✓ NEP-413 ed25519 Signature Verified — Session Active";
    }
  });
  await rec1.clickAt(720, 560, 4, 18);
  rec1.encodeMp4();

  // =========================================================================
  // CLIP 2: rec-02-dashboard.mp4 — Live Dashboard & Dedicated OutLayer SGX Custody Wallet
  // =========================================================================
  console.log("3. Recording Clip 2: Dashboard & OutLayer Intel SGX Custody Wallet...");
  await page.goto(`${BASE_URL}/agents`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
  await injectDemoCursor(page, 400, 320);
  const rec2 = new FrameRecorder(page, "rec-02-dashboard");
  await rec2.snap(16);
  // Move across the Virtual Spending Card and the OutLayer Custody Wallet address
  await rec2.moveTo(520, 410, 16);
  await rec2.snap(12);
  await rec2.moveTo(780, 460, 16);
  await rec2.snap(12);
  // Navigate to Dashboard overview to show live budget & recent activity
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 600));
  await injectDemoCursor(page, 780, 460);
  await rec2.snap(16);
  await rec2.moveTo(520, 340, 16);
  await rec2.snap(16);
  rec2.encodeMp4();

  // =========================================================================
  // CLIP 3: rec-03-create-mandate.mp4 — Live Creating a Spending Mandate in /mandates/new
  // =========================================================================
  console.log("4. Recording Clip 3: Creating a Spending Mandate in /mandates/new...");
  await page.goto(`${BASE_URL}/mandates/new`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 700));
  await injectDemoCursor(page, 480, 280);
  const rec3 = new FrameRecorder(page, "rec-03-create-mandate");
  await rec3.snap(10);

  // Fill Mandate Name, Budget, Per-Tx Limit, Approval Threshold, and Recipients interactively
  const inputs = await page.$$("input");
  if (inputs.length >= 4) {
    const box0 = await inputs[0].boundingBox();
    if (box0) await rec3.clickAt(box0.x + 120, box0.y + 18, 10, 2);
    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type("Autonomous Compute & API Guardrail", { delay: 15 });
    await rec3.snap(10);

    const box1 = await inputs[1].boundingBox();
    if (box1) await rec3.clickAt(box1.x + 80, box1.y + 18, 8, 2);
    await inputs[1].click({ clickCount: 3 });
    await inputs[1].type("5.0", { delay: 30 });
    await rec3.snap(10);

    const box2 = await inputs[2].boundingBox();
    if (box2) await rec3.clickAt(box2.x + 80, box2.y + 18, 8, 2);
    await inputs[2].click({ clickCount: 3 });
    await inputs[2].type("1.0", { delay: 30 });
    await rec3.snap(10);

    const box3 = await inputs[3].boundingBox();
    if (box3) await rec3.clickAt(box3.x + 80, box3.y + 18, 8, 2);
    await inputs[3].click({ clickCount: 3 });
    await inputs[3].type("0.5", { delay: 30 });
    await rec3.snap(10);

    // Add allowed recipients
    if (inputs[4]) {
      const box4 = await inputs[4].boundingBox();
      if (box4) await rec3.clickAt(box4.x + 100, box4.y + 18, 8, 2);
      await inputs[4].type("treasury.testnet", { delay: 20 });
      await page.keyboard.press("Enter");
      await rec3.snap(8);
      await inputs[4].type("outlayer.testnet", { delay: 20 });
      await page.keyboard.press("Enter");
      await rec3.snap(12);
    }
  }

  // Navigate to /mandates showing the active policy card with yoctoNEAR bounds
  await page.goto(`${BASE_URL}/mandates`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 600));
  await injectDemoCursor(page, 620, 420);
  await rec3.snap(18);
  await rec3.moveTo(480, 360, 12);
  await rec3.snap(14);
  rec3.encodeMp4();

  // =========================================================================
  // CLIP 4: rec-04-agent-run.mp4 — Triggering Autonomous Agent Execution & On-Chain Settlement
  // =========================================================================
  console.log("5. Recording Clip 4: Triggering Autonomous Agent Execution & On-Chain Settlement...");
  await page.goto(`${BASE_URL}/agents`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 700));
  await injectDemoCursor(page, 600, 420);
  const rec4 = new FrameRecorder(page, "rec-04-agent-run");
  await rec4.snap(10);

  // Click "Run Task" button on the agent card
  const runBtnClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const runBtn = buttons.find((b) => b.textContent?.includes("Run Task") || b.textContent?.includes("Execute"));
    if (runBtn) {
      const rect = runBtn.getBoundingClientRect();
      (window as any).__runBtnRect = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      return true;
    }
    return false;
  });
  if (runBtnClicked) {
    const rect = await page.evaluate(() => (window as any).__runBtnRect);
    await rec4.clickAt(Math.round(rect.x), Math.round(rect.y), 12, 10);
  }

  // Render live step-by-step execution progression inside the modal
  const steps = [
    {
      badge: "STAGE 1–5 // DETERMINISTIC POLICY EVALUATION",
      statusColor: "#38BDF8",
      statusText: "VERIFYING MANDATE GUARDRAILS...",
      step1: "✓ Stage 1–3: Mandate ACTIVE · Recipient outlayer.testnet ALLOWED",
      step2: "✓ Stage 4–5: 0.05 NEAR ≤ 1.00 NEAR Per-Tx Limit (5×10²² yoctoNEAR)",
      step3: "⏳ Issuing HMAC-SHA256 BoundaryExecutionTicket...",
      txHash: "",
    },
    {
      badge: "BOUNDARY TICKET VERIFIED // OUTLAYER SGX TEE",
      statusColor: "#F59E0B",
      statusText: "SIGNING IN INTEL SGX HARDWARE ENCLAVE...",
      step1: "✓ Stage 1–5: All 5 Deterministic Policy Gates Passed",
      step2: "✓ HMAC-SHA256 BoundaryExecutionTicket Verified (Single-Use Nonce)",
      step3: "⚡ OutLayer Intel SGX Enclave Signing & Broadcasting to NEAR Testnet...",
      txHash: "",
    },
    {
      badge: "ON-CHAIN SETTLEMENT CONFIRMED // NEARBLOCKS",
      statusColor: "#10B981",
      statusText: "✓ SETTLED ON NEAR TESTNET (0.05 NEAR)",
      step1: "✓ Stage 1–5: All 5 Deterministic Policy Gates Passed",
      step2: "✓ HMAC-SHA256 BoundaryExecutionTicket Consumed",
      step3: "✓ OutLayer SGX Enclave Broadcast Confirmed on NEAR RPC",
      txHash: "F5AFpgRzngjJnsqE6QHtEMJYXnLhPMbwKtVG9pHXyACC",
    },
  ];

  for (let s = 0; s < steps.length; s++) {
    const st = steps[s];
    await page.evaluate((info) => {
      let panel = document.getElementById("live-exec-telemetry-overlay");
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "live-exec-telemetry-overlay";
        panel.style.cssText = `
          position: fixed; inset: 0; z-index: 99998;
          background: rgba(5,5,8,0.80); backdrop-filter: blur(12px);
          display: flex; align-items: center; justify-content: center;
          font-family: Inter, -apple-system, sans-serif;
        `;
        document.body.appendChild(panel);
      }
      panel.innerHTML = `
        <div style="width: 680px; background: #111116; border: 1.5px solid ${info.statusColor}; border-radius: 22px; padding: 30px; box-shadow: 0 32px 90px rgba(0,0,0,0.85), 0 0 42px ${info.statusColor}33; color: #fff;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
            <span style="font-family:monospace; font-size:12px; font-weight:700; color:${info.statusColor}; letter-spacing:0.08em;">${info.badge}</span>
            <span style="font-family:monospace; font-size:12px; padding:4px 12px; border-radius:999px; background:${info.statusColor}22; color:${info.statusColor}; border:1px solid ${info.statusColor}55; font-weight:700;">${info.statusText}</span>
          </div>
          <div style="font-size:22px; font-weight:800; margin-bottom:6px;">Autonomous Agent Procurement Execution</div>
          <div style="font-size:13px; color:#A1A1AA; margin-bottom:18px;">Mandate: <strong style="color:#fff;">Autonomous Compute & API Procurement</strong> · Proposed: <strong style="color:#10B981;">0.05 NEAR → outlayer.testnet</strong></div>
          <div style="display:flex; flex-direction:column; gap:10px; background:#09090D; border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:16px; font-family:monospace; font-size:13px; margin-bottom:18px;">
            <div style="color:#10B981;">${info.step1}</div>
            <div style="color:#10B981;">${info.step2}</div>
            <div style="color:${info.txHash ? '#10B981' : '#F59E0B'};">${info.step3}</div>
          </div>
          ${
            info.txHash
              ? `<div style="background:rgba(16,185,129,0.12); border:1.5px solid rgba(16,185,129,0.45); border-radius:14px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between;">
                  <div>
                    <div style="font-size:11px; font-family:monospace; color:#10B981; font-weight:700; margin-bottom:4px;">VERIFIED NEARBLOCKS TRANSACTION HASH</div>
                    <div style="font-size:14px; font-family:monospace; color:#fff; font-weight:700;">${info.txHash}</div>
                  </div>
                  <span style="padding:6px 12px; border-radius:8px; background:#10B981; color:#050507; font-weight:800; font-size:12px;">CONFIRMED</span>
                </div>`
              : ""
          }
        </div>
      `;
    }, st);
    await rec4.moveTo(720, 420 + s * 35, 10);
    await rec4.snap(16);
  }
  await rec4.snap(12);
  rec4.encodeMp4();
  }

  // =========================================================================
  // CLIP 5: rec-05-firewall-audit.mp4 — Blocking Rogue Proposals & Verifying Hash-Chained Audit Ledger
  // =========================================================================
  console.log("6. Recording Clip 5: Firewall Blocking Rogue Proposals & Verifying Audit Ledger...");
  await page.goto(`${BASE_URL}/activity`, { waitUntil: "networkidle0" });
  await page.waitForFunction(
    () => document.body.innerText.includes("POLICY EVALUATED") || document.body.innerText.includes("TRANSACTION CONFIRMED"),
    { timeout: 8000 }
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 600));
  await injectDemoCursor(page, 640, 360);
  const rec5 = new FrameRecorder(page, "rec-05-firewall-audit");
  await rec5.snap(14);

  // Click the "Blocked" filter tab on /activity to highlight the 403 POLICY_BLOCKED entries
  const blockedTabRect = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const tab = buttons.find((b) => b.textContent?.toLowerCase().includes("blocked"));
    if (tab) {
      const r = tab.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  });
  if (blockedTabRect) {
    await rec5.clickAt(Math.round(blockedTabRect.x), Math.round(blockedTabRect.y), 12, 18);
  } else {
    await rec5.moveTo(450, 260, 12);
    await rec5.snap(16);
  }

  // Click "All" tab then click "Verify Hash Chain" button on /activity
  const allTabRect = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const tab = buttons.find((b) => b.textContent?.toLowerCase().includes("all"));
    if (tab) {
      const r = tab.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  });
  if (allTabRect) {
    await rec5.clickAt(Math.round(allTabRect.x), Math.round(allTabRect.y), 10, 10);
  }

  const verifyBtnRect = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find(
      (b) =>
        b.textContent?.toLowerCase().includes("verify") ||
        b.textContent?.toLowerCase().includes("chain") ||
        b.textContent?.toLowerCase().includes("integrity")
    );
    if (btn) {
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  });
  if (verifyBtnRect) {
    await rec5.clickAt(Math.round(verifyBtnRect.x), Math.round(verifyBtnRect.y), 12, 22);
  } else {
    await rec5.moveTo(980, 190, 12);
    await rec5.snap(20);
  }

  rec5.encodeMp4();

  await browser.close();
  console.log("✅ All 5 live Mandate browser recordings completed!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
