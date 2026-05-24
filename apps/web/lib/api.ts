"use client";

import type {
  AgentArchetype,
  AgentSnapshot,
  CreateAgentPayload,
  DelegationGrant,
  DelegationRole,
  LoginPayload,
  MemoryItem,
  SignupPayload,
  SubAgent
} from "@genfren/shared";

const TOKEN_KEY = "genfren-token";
const LOCAL_STATE_KEY = "genfren-local-state";
const LOCAL_AUTH_KEY = "genfren-local-auth";

export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL ?? "/api";
}

export function getToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(path: string, options: RequestInit = {}) {
  const token = getToken();
  try {
    const response = await fetch(`${getApiBase()}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {})
      }
    });
    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new Error(message || "Request failed.");
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (isNetworkUnavailable(error)) {
      return localFallback<T>(path, options);
    }
    throw error;
  }
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}

function isNetworkUnavailable(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("all api targets failed") ||
    message.includes("api targets") ||
    message.includes("primary_api_url") ||
    message.includes("not configured") ||
    message.includes("unavailable")
  );
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function defaultSnapshot(username = "genfren-user", email = "local@genfren.app", walletAddress = "0xLocalVault"): AgentSnapshot {
  const userId = makeId("local_user");
  return {
    user: {
      id: userId,
      username,
      email,
      walletAddress,
      status: "pending_payment",
      createdAt: nowIso()
    },
    payment: {
      id: makeId("local_pay"),
      userId,
      network: "bradbury",
      amountGen: 10,
      treasuryAddress: process.env.NEXT_PUBLIC_BRADBURY_TREASURY_ADDRESS ?? "0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E",
      txHash: `local_${Date.now()}`,
      confirmedAt: null,
      status: "pending_submission"
    },
    agent: null,
    briefings: [],
    tasks: [],
    memory: [
      {
        id: makeId("local_mem"),
        type: "behavioral",
        summary: "GenFren is running in local vault mode until the hosted backend is reachable.",
        importance: "medium",
        createdAt: nowIso()
      }
    ],
    delegation: []
  };
}

function loadLocalSnapshot() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LOCAL_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgentSnapshot;
  } catch {
    return null;
  }
}

function saveLocalSnapshot(snapshot: AgentSnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(snapshot));
}

function saveLocalAuth(payload: Pick<SignupPayload, "username" | "email" | "walletAddress">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(payload));
}

function loadLocalAuth() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LOCAL_AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Pick<SignupPayload, "username" | "email" | "walletAddress">;
  } catch {
    return null;
  }
}

async function localFallback<T>(path: string, options: RequestInit = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  const body = options.body ? JSON.parse(String(options.body)) : {};

  if (path === "/auth/signup" && method === "POST") {
    const payload = body as SignupPayload;
    const snapshot = defaultSnapshot(payload.username, payload.email, payload.walletAddress);
    const token = `local_${snapshot.user.id}`;
    saveLocalAuth(payload);
    saveLocalSnapshot(snapshot);
    setToken(token);
    return { token, snapshot } as T;
  }

  if (path === "/auth/login" && method === "POST") {
    const payload = body as LoginPayload;
    const auth = loadLocalAuth();
    let snapshot = loadLocalSnapshot();
    if (!auth || auth.username !== payload.username || !snapshot) {
      throw new Error("No local vault found for this username. Create an account first.");
    }
    const token = `local_${snapshot.user.id}`;
    setToken(token);
    return {
      token,
      snapshot,
      vault: {
        walletAddress: auth.walletAddress
      }
    } as T;
  }

  let snapshot = loadLocalSnapshot();
  if (!snapshot) {
    snapshot = defaultSnapshot();
    saveLocalSnapshot(snapshot);
  }

  if (path === "/me" || path === "/agents/current") {
    return snapshot as T;
  }

  if (path === "/payments/submit" && method === "POST") {
    snapshot.payment = {
      ...(snapshot.payment ?? defaultSnapshot().payment!),
      txHash: body.txHash,
      status: "confirmed",
      confirmedAt: nowIso()
    };
    snapshot.user.status = "active";
    saveLocalSnapshot(snapshot);
    return snapshot.payment as T;
  }

  if (path === "/agents" && method === "POST") {
    const payload = body as CreateAgentPayload;
    snapshot.user.status = "active";
    if (snapshot.payment) {
      snapshot.payment.status = "confirmed";
      snapshot.payment.confirmedAt = snapshot.payment.confirmedAt ?? nowIso();
    }
    snapshot.agent = {
      id: makeId("local_agent"),
      ownerId: snapshot.user.id,
      name: payload.name,
      archetype: payload.archetype,
      status: "active",
      contractAddress: "local-vault-mode",
      factoryContractAddress: "local-vault-mode",
      subagents: [],
      policy: {
        maxDailyRuns: 6,
        maxActiveSubagents: 4,
        allowedSourceClasses: ["public-web", "project-docs", "manual-links"],
        canDraftContent: payload.archetype === "content-draft",
        canCreateSubagents: true,
        canScheduleMonitoring: true
      },
      goals: [
        {
          id: makeId("local_goal"),
          topic: payload.topic,
          objective: payload.objective,
          sourceUrls: payload.sourceUrls,
          cadence: payload.cadence,
          tone: payload.tone,
          status: "active"
        }
      ]
    };
    snapshot.tasks = [
      {
        id: makeId("local_task"),
        name: `${payload.cadence} ${payload.topic} briefing`,
        status: "scheduled",
        scheduledFor: nowIso(),
        lastResult: "Waiting for the first briefing run."
      }
    ];
    snapshot.briefings = [
      {
        id: makeId("local_brief"),
        title: "Companion workspace created",
        summary: `GenFren is tracking ${payload.topic} for: ${payload.objective}`,
        confidence: "medium",
        consensusState: "degraded",
        sourceRefs: payload.sourceUrls.map((url) => ({ url })),
        createdAt: nowIso()
      }
    ];
    snapshot.memory = [
      {
        id: makeId("local_mem"),
        type: "goal",
        summary: `User wants ${payload.name} to track ${payload.topic} and support this objective: ${payload.objective}`,
        importance: "high",
        createdAt: nowIso()
      },
      ...snapshot.memory
    ];
    saveLocalSnapshot(snapshot);
    return snapshot as T;
  }

  if (path === "/agents/current/chat" && method === "POST") {
    const message = String(body.message ?? "");
    const topic = snapshot.agent?.goals[0]?.topic ?? "your current focus";
    const reply = {
      message: `I am keeping ${topic} in context. For now I am using your local vault state, so I can help continue the thread here while hosted sync is reconnecting. You said: "${message}"`,
      confidence: "medium",
      consensusState: "degraded"
    };
    const memoryItem: MemoryItem = {
      id: makeId("local_mem"),
      type: "short-term",
      summary: `Recent user message: ${message}`,
      importance: "medium",
      createdAt: nowIso()
    };
    snapshot.memory = [
      memoryItem,
      ...snapshot.memory
    ].slice(0, 12);
    saveLocalSnapshot(snapshot);
    return { reply, state: ["Retrieving local memory", "Preparing companion response"] } as T;
  }

  if (path === "/delegations" && method === "POST") {
    const grant: DelegationGrant = {
      id: makeId("local_del"),
      handle: String(body.handle),
      role: body.role as DelegationRole,
      delegateAddress: String(body.address),
      grantedAt: nowIso()
    };
    snapshot.delegation = [grant, ...snapshot.delegation];
    saveLocalSnapshot(snapshot);
    return grant as T;
  }

  if (path === "/subagents" && method === "POST") {
    const subagent: SubAgent = {
      id: makeId("local_sub"),
      name: String(body.name),
      archetype: body.archetype as AgentArchetype,
      role: String(body.role),
      contractAddress: String(body.contractAddress),
      status: "active"
    };
    if (snapshot.agent) {
      snapshot.agent.subagents = [subagent, ...snapshot.agent.subagents];
    }
    saveLocalSnapshot(snapshot);
    return subagent as T;
  }

  if (path === "/contracts/subagent-code") {
    return {
      code: "# GenFrenSubAgent contract code is loaded from the hosted backend when sync is available."
    } as T;
  }

  throw new Error("The hosted backend is unavailable. Try again after the service reconnects.");
}

export async function signup(payload: SignupPayload & { password: string }) {
  const result = await request<{ token: string; snapshot: AgentSnapshot }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  setToken(result.token);
  return result;
}

export async function login(payload: LoginPayload) {
  const result = await request<{ token: string; snapshot: AgentSnapshot; vault: Record<string, string> }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  setToken(result.token);
  return result;
}

export function getSnapshot() {
  return request<AgentSnapshot>("/me");
}

export function submitPayment(txHash: string) {
  return request("/payments/submit", {
    method: "POST",
    body: JSON.stringify({ txHash })
  });
}

export function createAgent(payload: CreateAgentPayload) {
  return request("/agents", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function chatWithAgent(message: string) {
  return request<{ reply: Record<string, unknown>; state: string[] }>("/agents/current/chat", {
    method: "POST",
    body: JSON.stringify({ message })
  });
}

export function registerSubagent(payload: {
  name: string;
  archetype: string;
  role: string;
  contractAddress: string;
  deploymentTxHash: string;
  registerTxHash: string;
}) {
  return request("/subagents", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function grantDelegation(payload: { handle: string; address: string; role: string }) {
  return request("/delegations", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getSubagentCode() {
  return request<{ code: string }>("/contracts/subagent-code");
}
