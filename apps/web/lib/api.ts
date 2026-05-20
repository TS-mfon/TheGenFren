"use client";

import type { AgentSnapshot, CreateAgentPayload, LoginPayload, SignupPayload } from "@genfren/shared";

const TOKEN_KEY = "genfren-token";

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
  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed.");
  }
  return response.json() as Promise<T>;
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
