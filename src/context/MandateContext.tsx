"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  nearToYocto,
  yoctoToNear,
  addYocto,
  subYocto,
} from "@/lib/yocto";
import {
  type PolicyDecision,
  type MandateStateForPolicy,
} from "@/lib/policy";

export type TaskStatus =
  | "draft"
  | "planned"
  | "policy_checked"
  | "awaiting_approval"
  | "executing"
  | "succeeded"
  | "failed"
  | "needs_review";

export interface PlanStep {
  id: string;
  title: string;
  status: "completed" | "in_progress" | "pending" | "blocked";
}

export interface MandateItem extends MandateStateForPolicy {
  description: string;
  createdAtLabel: string;
  walletAddress: string;
  agentId?: string;
  agentName?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  goal: string;
  mandateId: string;
  mandateName: string;
  status: TaskStatus;
  recipient: string;
  amountAtomic: string;
  purpose: string;
  idempotencyKey: string;
  txHash?: string;
  providerRequestId?: string;
  createdAtLabel: string;
  steps: PlanStep[];
  policyDecision?: PolicyDecision;
}

export interface ApprovalItem {
  id: string;
  taskId: string;
  taskTitle: string;
  taskGoal?: string;
  agentName?: string;
  agentWalletAddress?: string;
  mandateId: string;
  mandateName: string;
  mandateRemainingNear?: string;
  recipient: string;
  amountAtomic: string;
  thresholdAtomic: string;
  purpose: string;
  createdAtLabel: string;
  status: "pending" | "approved" | "rejected";
}

export interface ActivityEvent {
  id: string;
  title: string;
  subtitle: string;
  amountLabel?: string;
  timestampLabel: string;
  createdAtIso?: string;
  category: "payment" | "task" | "mandate" | "policy" | "approval" | "funding" | "agent";
  badgeText: "Success" | "Active" | "Info" | "Blocked" | "Needs Approval";
  badgeVariant: "success" | "info" | "warning" | "error";
  txHash?: string;
  providerRequestId?: string;
  taskId?: string;
  mandateId?: string;
  payloadJson: Record<string, unknown>;
}

export interface AgentWalletState {
  id: string;
  walletId: string;
  nearAccountId: string;
  handoffUrl?: string;
  network: string;
  isFrozen: boolean;
  balanceYocto: string;
  balanceNear: string;
  onchainActive: boolean;
}

export interface PersonalWalletState {
  accountId: string;
  balanceNear: string;
  balanceYocto: string;
  network: string;
  explorerUrl: string;
  isConnected: boolean;
}

export interface AgentWalletItem {
  agentId: string;
  agentName: string;
  agentStatus: string;
  walletId?: string;
  nearAccountId: string;
  balanceYocto: string;
  balanceNear: string;
  onchainActive: boolean;
  isInitialized?: boolean;
  initializationStatus?: string;
  colorVariant?: string;
  mandatesCount: number;
}

export interface UserProfile {
  displayName: string;
  email: string;
  bio: string;
  role: string;
}

interface MandateContextValue {
  accountId: string;
  sessionToken: string | null;
  network: "testnet";
  userNearBalance: string;
  walletProvider: string;
  userProfile: UserProfile | null;
  personalWallet: PersonalWalletState | null;
  agentWallet: AgentWalletState | null;
  agentWallets: AgentWalletItem[];
  totalAgentBalanceNear: string;
  walletAddress: string;
  walletBalanceAtomic: string;
  twoFactorEnabled: boolean;
  emailNotifications: boolean;
  mandates: MandateItem[];
  tasks: TaskItem[];
  approvals: ApprovalItem[];
  activities: ActivityEvent[];
  totalBudgetNear: string;
  totalSpentNear: string;
  totalReservedNear: string;
  totalRemainingNear: string;
  isLoading: boolean;
  isWalletModalOpen: boolean;
  setIsWalletModalOpen: (open: boolean) => void;
  refreshData: () => Promise<void>;
  updateUserProfile: (profile: Partial<UserProfile>) => Promise<boolean>;
  toggleAgentFreeze: (agentId: string) => Promise<boolean>;
  changeAgentCardColor: (agentId: string, colorVariant: string) => Promise<boolean>;
  connectWallet: (accountId: string, providerName?: string) => Promise<{ ok: boolean; error?: string; onchain?: any }>;
  disconnectWallet: () => void;
  createAgentWallet: () => Promise<{ ok: boolean; error?: string; wallet?: AgentWalletState }>;
  fundAgentWallet: (amountNear: string, agentId?: string) => Promise<{ ok: boolean; error?: string; txHash?: string }>;
  createMandate: (input: {
    name: string;
    description?: string;
    agentId?: string;
    budgetNear: string;
    perTxLimitNear: string;
    approvalThresholdNear: string;
    allowedRecipients: string[];
    expiresAtIso: string;
  }) => Promise<{ ok: boolean; error?: string; mandateId?: string }>;
  revokeMandate: (mandateId: string) => Promise<void>;
  togglePauseMandate: (mandateId: string, currentStatus: string) => Promise<void>;
  createTask: (input: {
    title: string;
    goal: string;
    mandateId: string;
    recipient: string;
    amountNear: string;
    purpose: string;
  }) => Promise<{ ok: boolean; taskId?: string; error?: string; verdict?: string }>;
  executeTaskPayment: (taskId: string) => Promise<void>;
  approvePayment: (approvalId: string, signatureData?: any) => Promise<void>;
  rejectPayment: (approvalId: string) => Promise<void>;
  toggleTwoFactor: () => void;
  toggleEmailNotifications: () => void;
  switchAccount: (newAccount: string) => void;
  resetDemoData: () => void;
}

const MandateContext = createContext<MandateContextValue | undefined>(undefined);

const LOCAL_STORAGE_ACCOUNT_KEY = "mandate_active_account_v2";

export function MandateProvider({ children }: { children: React.ReactNode }) {
  const [accountId, setAccountId] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [walletProvider, setWalletProvider] = useState<string>("MyNearWallet");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userNearBalance, setUserNearBalance] = useState("0.000");
  const [personalWallet, setPersonalWallet] = useState<PersonalWalletState | null>(null);
  const [agentWallet, setAgentWallet] = useState<AgentWalletState | null>(null);
  const [agentWallets, setAgentWallets] = useState<AgentWalletItem[]>([]);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [mandates, setMandates] = useState<MandateItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Restore active user from localStorage on mount
  useEffect(() => {
    try {
      if (localStorage.getItem("mandate_explicitly_disconnected") === "true") {
        return;
      }
      const saved = localStorage.getItem(LOCAL_STORAGE_ACCOUNT_KEY);
      const savedToken = localStorage.getItem("mandate_session_token");
      const savedProvider = localStorage.getItem("mandate_wallet_provider");
      if (saved) {
        setAccountId(saved);
      }
      if (savedToken) {
        setSessionToken(savedToken);
      }
      if (savedProvider) {
        setWalletProvider(savedProvider);
      }
    } catch {}
  }, []);

  const getHeaders = useCallback(() => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (accountId) {
      h["x-near-account"] = accountId;
    }
    if (sessionToken) {
      h["x-session-token"] = sessionToken;
    }
    return h;
  }, [accountId, sessionToken]);

  // Synchronize data from backend REST APIs
  const refreshData = useCallback(async () => {
    if (!accountId && !sessionToken) {
      setIsLoading(false);
      setPersonalWallet(null);
      setAgentWallet(null);
      setAgentWallets([]);
      setMandates([]);
      setTasks([]);
      setApprovals([]);
      setActivities([]);
      return;
    }

    try {
      setIsLoading(true);
      const headers = getHeaders();

      // 1. Fetch Auth & Connected User details
      let authRes = await fetch("/api/auth", { headers });
      if (authRes.status === 401 && accountId) {
        // Session expired or invalidated by server restart; automatically re-authenticate
        try {
          const reAuthRes = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountId }),
          });
          if (reAuthRes.ok) {
            const reAuthData = await reAuthRes.json();
            if (reAuthData.user?.sessionToken) {
              setSessionToken(reAuthData.user.sessionToken);
              try {
                localStorage.setItem("mandate_session_token", reAuthData.user.sessionToken);
              } catch {}
              headers["x-session-token"] = reAuthData.user.sessionToken;
              authRes = await fetch("/api/auth", { headers });
            }
          }
        } catch (reAuthErr) {
          console.warn("Auto-reauthentication failed:", reAuthErr);
        }
      }

      if (authRes.ok) {
        const authData = await authRes.json();
        if (authData.user) {
          setUserProfile({
            displayName: authData.user.displayName || "",
            email: authData.user.email || "",
            bio: authData.user.bio || "",
            role: authData.user.role || "OWNER",
          });
        }
        if (authData.onchain?.balanceNear) {
          setUserNearBalance(authData.onchain.balanceNear);
        }
      }

      // Query live NEAR testnet RPC directly to ensure real balance reading
      if (accountId && (accountId.endsWith(".testnet") || accountId.length === 64 || accountId.startsWith("0x"))) {
        try {
          const rpcRes = await fetch("https://test.rpc.fastnear.com", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "direct-user-balance",
              method: "query",
              params: {
                request_type: "view_account",
                finality: "final",
                account_id: accountId.trim().toLowerCase(),
              },
            }),
          });
          const rpcJson = await rpcRes.json();
          if (rpcJson.result?.amount) {
            setUserNearBalance(yoctoToNear(rpcJson.result.amount, 3));
          }
        } catch (rpcErr) {
          console.warn("Direct RPC balance query non-blocking warning:", rpcErr);
        }
      }

      // 2. Fetch Dedicated Agent Wallets & Personal Wallet
      const walletRes = await fetch("/api/wallets", { headers });
      if (walletRes.ok) {
        const walletData = await walletRes.json();
        if (walletData.personalWallet) {
          setUserNearBalance(walletData.personalWallet.balanceNear || "0.000");
          setPersonalWallet({
            accountId: walletData.personalWallet.accountId,
            balanceNear: walletData.personalWallet.balanceNear || "0.000",
            balanceYocto: walletData.personalWallet.balanceYocto || "0",
            network: walletData.personalWallet.network || "testnet",
            explorerUrl:
              walletData.personalWallet.explorerUrl ||
              `https://testnet.nearblocks.io/address/${walletData.personalWallet.accountId}`,
            isConnected: Boolean(walletData.personalWallet.accountId),
          });
        }

        if (walletData.agentWallets && walletData.agentWallets.length > 0) {
          setAgentWallets(walletData.agentWallets);
          const primary = walletData.agentWallets[0];
          setAgentWallet({
            id: primary.walletId || primary.agentId,
            walletId: primary.walletId || "",
            nearAccountId: primary.nearAccountId,
            handoffUrl: primary.handoffUrl,
            network: "testnet",
            isFrozen: false,
            balanceYocto: primary.balanceYocto || "0",
            balanceNear: primary.balanceNear || "0.000",
            onchainActive: primary.onchainActive || false,
          });
        } else if (walletData.wallet) {
          setAgentWallet({
            id: walletData.wallet.id,
            walletId: walletData.wallet.walletId,
            nearAccountId: walletData.wallet.nearAccountId,
            handoffUrl: walletData.wallet.handoffUrl,
            network: walletData.wallet.network || "testnet",
            isFrozen: walletData.wallet.isFrozen || false,
            balanceYocto: walletData.wallet.balanceYocto || "0",
            balanceNear: walletData.wallet.balanceNear || "0.000",
            onchainActive: walletData.wallet.onchainActive || false,
          });
          setAgentWallets([
            {
              agentId: walletData.wallet.id,
              agentName: "Primary Agent",
              agentStatus: "ACTIVE",
              walletId: walletData.wallet.id,
              nearAccountId: walletData.wallet.nearAccountId,
              balanceYocto: walletData.wallet.balanceYocto || "0",
              balanceNear: walletData.wallet.balanceNear || "0.000",
              onchainActive: walletData.wallet.onchainActive || false,
              mandatesCount: 1,
            },
          ]);
        } else {
          setAgentWallet(null);
          setAgentWallets([]);
        }
      }

      // 3. Fetch Mandates
      const mandatesRes = await fetch("/api/mandates", { headers });
      if (mandatesRes.ok) {
        const data = await mandatesRes.json();
        if (data.mandates) {
          const mapped: MandateItem[] = data.mandates.map((m: any) => ({
            id: m.id,
            name: m.name,
            description: m.description || "",
            status: m.status.toLowerCase() as MandateStateForPolicy["status"],
            providerPolicyConfirmed: true,
            budgetAtomic: nearToYocto(m.totalBudgetNear),
            spentAtomic: nearToYocto(m.spentNear),
            reservedAtomic: nearToYocto(m.reservedNear),
            perTxLimitAtomic: nearToYocto(m.perTxLimitNear),
            approvalThresholdAtomic: nearToYocto(m.approvalThresholdNear),
            allowedRecipients: m.allowedRecipients,
            expiresAtIso: m.expiresAt,
            createdAtLabel: "Active",
            walletAddress: m.wallet?.nearAccountId || "outlayer-vault.testnet",
            agentId: m.agentId,
            agentName: m.agentName || "Agent",
          }));
          setMandates(mapped);
        }
      }

      // 4. Fetch Tasks
      const tasksRes = await fetch("/api/tasks", { headers });
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        if (data.tasks) {
          const mappedTasks: TaskItem[] = data.tasks.map((t: any) => {
            const rawStatus = t.status.toLowerCase();
            let status: TaskStatus = "planned";
            if (rawStatus === "completed") status = "succeeded";
            else if (rawStatus === "pending_approval") status = "awaiting_approval";
            else if (rawStatus === "executing") status = "executing";
            else if (rawStatus === "rejected" || rawStatus === "failed") status = "failed";

            return {
              id: t.id,
              title: t.title,
              goal: t.description || t.title,
              mandateId: t.mandate?.id || "",
              mandateName: t.mandate?.name || "Mandate",
              status,
              recipient: t.proposedRecipient,
              amountAtomic: t.proposedAmountYocto || nearToYocto(t.proposedAmountNear),
              purpose: t.title,
              idempotencyKey: t.idempotencyKey || t.id,
              txHash: t.transaction?.txHash,
              createdAtLabel: "Recently",
              policyDecision: t.policyDecision,
              steps: (t.planSteps || []).map((step: string, idx: number) => ({
                id: `step-${idx}`,
                title: step,
                status:
                  status === "succeeded"
                    ? "completed"
                    : status === "failed" && idx === 1
                    ? "blocked"
                    : idx === 0
                    ? "completed"
                    : "pending",
              })),
            };
          });
          setTasks(mappedTasks);
        }
      }

      // 5. Fetch Approvals
      const approvalsRes = await fetch("/api/approvals", { headers });
      if (approvalsRes.ok) {
        const data = await approvalsRes.json();
        if (data.approvals) {
          const mappedApprovals: ApprovalItem[] = data.approvals.map((a: any) => ({
            id: a.id,
            taskId: a.taskId || a.task?.id || "",
            taskTitle: a.taskTitle || a.task?.title || "Pending Payment",
            taskGoal: a.taskGoal || "",
            agentName: a.agentName || "AI Agent",
            agentWalletAddress: a.agentWalletAddress || "outlayer-vault.testnet",
            mandateId: a.mandateId || a.mandate?.id || "",
            mandateName: a.mandateName || a.mandate?.name || "Mandate",
            mandateRemainingNear: a.mandateRemainingNear || "0.000",
            recipient: a.recipient,
            amountAtomic: a.amountYocto || nearToYocto(a.amountNear),
            thresholdAtomic: a.thresholdNear ? nearToYocto(a.thresholdNear) : nearToYocto("0.050"),
            purpose: a.reason || "Exceeds approval threshold",
            createdAtLabel: "Pending",
            status: a.status.toLowerCase() as "pending" | "approved" | "rejected",
          }));
          setApprovals(mappedApprovals);
        }
      }

      // 6. Fetch Audit Logs for Activity Stream
      const auditRes = await fetch("/api/audit", { headers });
      if (auditRes.ok) {
        const data = await auditRes.json();
        if (data.logs) {
          const visibleLogs = data.logs.filter(
            (l: any) => l.eventType !== "WALLET_CONNECTED" && !l.eventType.includes("WALLET_CONNECT")
          );
          const mappedLogs: ActivityEvent[] = visibleLogs.map((l: any) => {
            let category: ActivityEvent["category"] = "policy";
            let badgeText: ActivityEvent["badgeText"] = "Info";
            let badgeVariant: ActivityEvent["badgeVariant"] = "info";

            if (l.eventType.includes("AGENT")) {
              category = "agent";
              badgeText = l.verdict === "REVOKED" ? "Blocked" : "Active";
              badgeVariant = l.verdict === "REVOKED" ? "error" : "info";
            } else if (
              l.eventType.includes("FUNDED") ||
              l.eventType.includes("WITHDRAWAL") ||
              l.eventType.includes("PROVISIONED")
            ) {
              category = "funding";
              badgeText = "Success";
              badgeVariant = "success";
            } else if (
              l.eventType.includes("PAYMENT") ||
              l.eventType.includes("OUTLAYER") ||
              l.eventType.includes("TRANSACTION") ||
              l.eventType.includes("EXECUTION")
            ) {
              category = "payment";
              badgeText =
                l.verdict === "SUCCESS" || l.eventType.includes("CONFIRMED")
                  ? "Success"
                  : l.verdict === "BROADCAST"
                  ? "Info"
                  : "Blocked";
              badgeVariant =
                l.verdict === "SUCCESS" || l.eventType.includes("CONFIRMED")
                  ? "success"
                  : l.verdict === "BROADCAST"
                  ? "info"
                  : "error";
            } else if (l.eventType.includes("APPROVAL")) {
              category = "approval";
              badgeText =
                l.verdict === "REJECTED" ? "Blocked" : "Needs Approval";
              badgeVariant = l.verdict === "REJECTED" ? "error" : "warning";
            } else if (l.eventType.includes("MANDATE") || l.eventType.includes("BUDGET")) {
              category = "mandate";
              badgeText = l.eventType.includes("PAUSED")
                ? "Info"
                : l.eventType.includes("REVOKED")
                ? "Blocked"
                : "Active";
              badgeVariant = l.eventType.includes("REVOKED")
                ? "error"
                : l.eventType.includes("PAUSED")
                ? "warning"
                : "info";
            } else if (l.verdict === "BLOCKED") {
              category = "policy";
              badgeText = "Blocked";
              badgeVariant = "error";
            }

            const rawAmount =
              l.details?.amountNear ||
              (l.details?.amountYocto
                ? `${yoctoToNear(l.details.amountYocto, 3)} NEAR`
                : l.details?.proposal?.amountAtomic
                ? `${yoctoToNear(l.details.proposal.amountAtomic, 3)} NEAR`
                : undefined);

            const txHash = l.details?.txHash || l.details?.tx_hash;

            const date = new Date(l.createdAt);
            const timeStr = !isNaN(date.getTime())
              ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Recently";

            return {
              id: l.id,
              title: l.eventType.replace(/_/g, " "),
              subtitle:
                l.taskTitle ||
                l.mandateName ||
                l.details?.proposal?.purpose ||
                "Deterministic Security Event",
              amountLabel: rawAmount,
              timestampLabel: timeStr,
              createdAtIso: l.createdAt,
              category,
              badgeText,
              badgeVariant,
              txHash,
              taskId: l.taskId,
              mandateId: l.mandateId,
              payloadJson: l.details || {},
            };
          });
          setActivities(mappedLogs);
        }
      }
    } catch (err) {
      console.error("Failed to refresh live data from backend:", err);
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  // Initial load and periodic live balance synchronization with instant window focus refresh
  useEffect(() => {
    if (accountId || sessionToken) {
      refreshData();

      // Fast polling (3.5s) while tab is visible so incoming onchain transfers reflect immediately
      const interval = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          refreshData();
        }
      }, 3500);

      const handleFocus = () => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          refreshData();
        }
      };

      window.addEventListener("focus", handleFocus);
      document.addEventListener("visibilitychange", handleFocus);

      return () => {
        clearInterval(interval);
        window.removeEventListener("focus", handleFocus);
        document.removeEventListener("visibilitychange", handleFocus);
      };
    }
  }, [refreshData, accountId, sessionToken]);

  // Connect Wallet
  const connectWallet = async (newAccountId: string, providerName: string = "MyNearWallet") => {
    try {
      setIsLoading(true);
      try {
        localStorage.removeItem("mandate_explicitly_disconnected");
      } catch {}
      setWalletProvider(providerName);
      try {
        localStorage.setItem("mandate_wallet_provider", providerName);
      } catch {}

      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: newAccountId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { ok: false, error: data.error || "Failed to connect wallet" };
      }

      setAccountId(data.user.nearAccountId);
      setSessionToken(data.user.sessionToken);
      if (data.user) {
        setUserProfile({
          displayName: data.user.displayName || "",
          email: data.user.email || "",
          bio: data.user.bio || "",
          role: data.user.role || "OWNER",
        });
      }
      if (data.onchain?.balanceNear) {
        setUserNearBalance(data.onchain.balanceNear);
      }
      try {
        localStorage.setItem(LOCAL_STORAGE_ACCOUNT_KEY, data.user.nearAccountId);
        if (data.user.sessionToken) {
          localStorage.setItem("mandate_session_token", data.user.sessionToken);
        }
      } catch {}

      await refreshData();
      return { ok: true, onchain: data.onchain };
    } catch (err: any) {
      return { ok: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Disconnect Wallet
  const disconnectWallet = () => {
    try {
      localStorage.setItem("mandate_explicitly_disconnected", "true");
      localStorage.removeItem(LOCAL_STORAGE_ACCOUNT_KEY);
      localStorage.removeItem("mandate_session_token");
      localStorage.removeItem("mandate_wallet_provider");
      sessionStorage.removeItem("mandate_pending_funding");
    } catch {}

    setAccountId("");
    setSessionToken(null);
    setUserProfile(null);
    setUserNearBalance("0.000");
    setPersonalWallet(null);
    setAgentWallet(null);
    setAgentWallets([]);
    setMandates([]);
    setTasks([]);
    setApprovals([]);
    setActivities([]);
  };

  // Update Profile
  const updateUserProfile = async (profile: Partial<UserProfile>) => {
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (res.ok && data.success && data.profile) {
        setUserProfile(data.profile);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Toggle Agent Freeze (Kill-Switch)
  const toggleAgentFreeze = async (agentId: string) => {
    const agent = agentWallets.find((a) => a.agentId === agentId);
    const nextStatus = agent?.agentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await refreshData();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Change Agent Card Color Variant
  const changeAgentCardColor = async (agentId: string, colorVariant: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ colorVariant }),
      });
      if (res.ok) {
        await refreshData();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Create Dedicated Agent Wallet
  const createAgentWallet = async () => {
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { ok: false, error: data.error || "Failed to provision agent wallet" };
      }

      await refreshData();
      return { ok: true, wallet: data.wallet };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  };

  // Fund Agent Wallet
  const fundAgentWallet = async (amountNear: string, agentId?: string) => {
    try {
      const txHash = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch("/api/wallets/fund", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ txHash, amountNear, agentId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { ok: false, error: data.error || "Failed to fund agent" };
      }

      await refreshData();
      return { ok: true, txHash };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  };

  // Total Agent Wallet Balance in NEAR
  const totalAgentBalanceNear = agentWallets
    .reduce((acc, w) => acc + parseFloat(w.balanceNear || "0"), 0)
    .toFixed(3);

  // Compute aggregate totals across active mandates
  const activeMandates = mandates.filter((m) => m.status === "active");
  const totalBudgetAtomic = activeMandates.reduce(
    (acc, m) => addYocto(acc, m.budgetAtomic),
    "0"
  );
  const totalSpentAtomic = activeMandates.reduce(
    (acc, m) => addYocto(acc, m.spentAtomic),
    "0"
  );
  const totalReservedAtomic = activeMandates.reduce(
    (acc, m) => addYocto(acc, m.reservedAtomic),
    "0"
  );
  const totalRemainingAtomic = subYocto(totalBudgetAtomic, totalSpentAtomic);

  // Create Mandate
  const createMandate: MandateContextValue["createMandate"] = async (input) => {
    try {
      const res = await fetch("/api/mandates", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          agentId: input.agentId,
          totalBudgetNear: input.budgetNear,
          perTxLimitNear: input.perTxLimitNear,
          approvalThresholdNear: input.approvalThresholdNear,
          allowedRecipients: input.allowedRecipients,
          expiresAt: input.expiresAtIso,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { ok: false, error: data.error || "Failed to create mandate" };
      }

      await refreshData();
      return { ok: true, mandateId: data.mandate.id };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  };

  const createTask: MandateContextValue["createTask"] = async (input) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          mandateId: input.mandateId,
          title: input.title,
          description: input.goal,
          proposedRecipient: input.recipient,
          proposedAmountNear: input.amountNear,
        }),
      });

      const data = await res.json();
      await refreshData();

      if (!res.ok && data.verdict === "BLOCK") {
        return {
          ok: false,
          verdict: "BLOCK",
          error: data.message || "Blocked by deterministic policy",
          taskId: data.task?.id,
        };
      }

      return {
        ok: true,
        verdict: data.verdict,
        taskId: data.task?.id,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  };

  const approvePayment = async (approvalId: string, signatureData?: any) => {
    try {
      await fetch("/api/approvals", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          approvalId,
          decision: "APPROVE",
          signature: signatureData?.signature,
          signerPublicKey: signatureData?.signerPublicKey,
          signatureDetails: signatureData,
        }),
      });
      await refreshData();
    } catch (err) {
      console.error("Failed to approve payment:", err);
    }
  };

  const rejectPayment = async (approvalId: string) => {
    try {
      await fetch("/api/approvals", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          approvalId,
          decision: "REJECT",
        }),
      });
      await refreshData();
    } catch (err) {
      console.error("Failed to reject payment:", err);
    }
  };

  const executeTaskPayment = async (taskId: string) => {
    try {
      setIsLoading(true);
      await fetch(`/api/tasks/${taskId}`, {
        method: "POST",
        headers: getHeaders(),
      });
      await refreshData();
    } catch (err) {
      console.error("Failed to execute task payment:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const revokeMandate = async (mandateId: string) => {
    try {
      await fetch(`/api/mandates/${mandateId}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      await refreshData();
    } catch (err) {
      console.error("Failed to revoke mandate:", err);
    }
  };

  const togglePauseMandate = async (mandateId: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === "active" ? "PAUSED" : "ACTIVE";
      await fetch(`/api/mandates/${mandateId}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ status: nextStatus }),
      });
      await refreshData();
    } catch (err) {
      console.error("Failed to toggle mandate status:", err);
    }
  };

  const toggleTwoFactor = () => setTwoFactorEnabled((v) => !v);
  const toggleEmailNotifications = () => setEmailNotifications((v) => !v);
  const switchAccount = (newAccount: string) => {
    connectWallet(newAccount);
  };
  const resetDemoData = () => refreshData();

  return (
    <MandateContext.Provider
      value={{
        accountId,
        sessionToken,
        network: "testnet",
        userNearBalance,
        walletProvider,
        userProfile,
        personalWallet,
        agentWallet,
        agentWallets,
        totalAgentBalanceNear,
        walletAddress: agentWallet?.nearAccountId || "outlayer-vault.testnet",
        walletBalanceAtomic: agentWallet?.balanceYocto || nearToYocto("0"),
        twoFactorEnabled,
        emailNotifications,
        mandates,
        tasks,
        approvals,
        activities,
        totalBudgetNear: yoctoToNear(totalBudgetAtomic),
        totalSpentNear: yoctoToNear(totalSpentAtomic),
        totalReservedNear: yoctoToNear(totalReservedAtomic),
        totalRemainingNear: yoctoToNear(totalRemainingAtomic),
        isLoading,
        isWalletModalOpen,
        setIsWalletModalOpen,
        refreshData,
        updateUserProfile,
        toggleAgentFreeze,
        changeAgentCardColor,
        connectWallet,
        disconnectWallet,
        createAgentWallet,
        fundAgentWallet,
        createMandate,
        revokeMandate,
        togglePauseMandate,
        createTask,
        executeTaskPayment,
        approvePayment,
        rejectPayment,
        toggleTwoFactor,
        toggleEmailNotifications,
        switchAccount,
        resetDemoData,
      }}
    >
      {children}
    </MandateContext.Provider>
  );
}

export function useMandate() {
  const ctx = useContext(MandateContext);
  if (!ctx) {
    throw new Error("useMandate must be used within a MandateProvider");
  }
  return ctx;
}
