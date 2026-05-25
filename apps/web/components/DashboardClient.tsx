"use client";

import { useEffect, useMemo, useState } from "react";

import type { AgentSnapshot } from "@genfren/shared";

import { chatWithAgent, getSnapshot, registerSubagent } from "../lib/api";
import { deploySubagentWithUserKey } from "../lib/vault";
import { AppShell } from "./AppShell";
import { MetricCard } from "./MetricCard";
import { SectionHeader } from "./SectionHeader";

type DashboardSection = "dashboard" | "agent" | "briefings" | "tasks" | "subagents" | "audit";
type ChatSource = "contract" | "local-vault";
type ChatMessage = {
  id: string;
  role: "user" | "agent";
  title?: string;
  body: string;
  confidence?: string;
  consensusState?: string;
  source?: ChatSource;
  state?: string[];
};

const sectionPitch: Record<DashboardSection, { eyebrow: string; title: string; detail: string }> = {
  dashboard: {
    eyebrow: "Workspace",
    title: "Your companion keeps the thread warm.",
    detail: "A quiet operating surface for goals, briefings, autonomous work, and the latest things your agent has done."
  },
  agent: {
    eyebrow: "Chat",
    title: "Talk to the contract-backed companion.",
    detail: "Ask your companion to continue a thread, explain a briefing, or turn a goal into the next move."
  },
  briefings: {
    eyebrow: "Briefings",
    title: "Your returning context.",
    detail: "Every update should answer what changed, why it matters, and what to do next."
  },
  tasks: {
    eyebrow: "Autonomy",
    title: "Autonomy you can inspect.",
    detail: "Scheduled, running, waiting, and completed work stay visible before they become noise."
  },
  subagents: {
    eyebrow: "Specialists",
    title: "Narrow helpers for focused work.",
    detail: "Add research, tracking, drafting, or goal support without cluttering the main companion."
  },
  audit: {
    eyebrow: "Audit logs",
    title: "A readable trail of agent activity.",
    detail: "See what your agent did, when it did it, and which part of the workspace changed."
  }
};

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatConsensusState(state?: string) {
  if (!state) return "";
  if (state === "verified") return "settled";
  if (state === "degraded") return "limited";
  if (state === "consensus_state") return "pending";
  return state.replace(/_/g, " ");
}

function humanizeAction(action: string) {
  return action
    .split(".")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, " "))
    .join(" ");
}

function normalizeReply(reply: unknown, source?: ChatSource): ChatMessage {
  if (typeof reply === "string") {
    return { id: makeId("msg"), role: "agent", title: "Agent reply", body: reply, source };
  }
  if (!reply || typeof reply !== "object") {
    return { id: makeId("msg"), role: "agent", title: "Agent reply", body: "I received that, but the reply payload was empty.", source };
  }

  const value = reply as Record<string, unknown>;
  const title = String(value.title ?? "Agent reply");
  const body = String(value.summary ?? value.message ?? value.body ?? JSON.stringify(value, null, 2));
  const confidence = typeof value.confidence === "string" ? value.confidence : undefined;
  const consensusState =
    typeof value.consensus_state === "string"
      ? value.consensus_state
      : typeof value.consensusState === "string"
        ? value.consensusState
        : undefined;

  return {
    id: makeId("msg"),
    role: "agent",
    title,
    body,
    confidence,
    consensusState,
    source
  };
}

function LoadingWorkspace() {
  return (
    <div className="loading-stack">
      <div className="skeleton hero-skeleton" />
      <div className="cards-3">
        <div className="skeleton metric-skeleton" />
        <div className="skeleton metric-skeleton" />
        <div className="skeleton metric-skeleton" />
      </div>
      <div className="skeleton table-skeleton" />
    </div>
  );
}

function SectionIntro({ section }: { section: DashboardSection }) {
  const pitch = sectionPitch[section];
  return (
    <section className="panel surface section-pitch">
      <div>
        <div className="eyebrow">{pitch.eyebrow}</div>
        <h2>{pitch.title}</h2>
        <p className="muted">{pitch.detail}</p>
      </div>
    </section>
  );
}

function EmptyFeature(props: { title: string; detail: string }) {
  return (
    <section className="panel surface empty-feature">
      <div className="step-pill">G</div>
      <strong>{props.title}</strong>
      <p className="muted">{props.detail}</p>
    </section>
  );
}

export function DashboardClient({ section }: { section: DashboardSection }) {
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [error, setError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "starter",
      role: "agent",
      title: "Ready when you are",
      body: "Tell me what changed, what you want to continue, or what you want me to turn into a trackable next move.",
      source: "contract"
    }
  ]);

  useEffect(() => {
    let mounted = true;
    setLoadingSnapshot(true);
    getSnapshot()
      .then((loaded) => {
        if (!mounted) return;
        setSnapshot(loaded);
        setError("");
      })
      .catch((caught) => {
        if (!mounted) return;
        setError(caught instanceof Error ? caught.message : "Failed to load snapshot.");
      })
      .finally(() => {
        if (mounted) setLoadingSnapshot(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const firstGoal = snapshot?.agent?.goals[0];
  const latestBriefing = snapshot?.briefings[0];
  const pitch = sectionPitch[section];
  const activeTasks = snapshot?.tasks.filter((task) => task.status === "scheduled" || task.status === "running") ?? [];
  const sourceMode = useMemo(() => {
    const latest = [...chatMessages].reverse().find((message) => message.role === "agent" && message.source);
    return latest?.source ?? "contract";
  }, [chatMessages]);

  async function reloadSnapshot() {
    try {
      setSnapshot(await getSnapshot());
    } catch {
      // Chat should stay usable even if the activity refresh misses.
    }
  }

  async function onChatSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const message = chatInput.trim();
    if (!message || chatSending) return;

    setChatInput("");
    setError("");
    setChatSending(true);
    setChatMessages((current) => [...current, { id: makeId("msg"), role: "user", body: message }]);

    try {
      const result = await chatWithAgent(message);
      const source = result.source ?? "contract";
      const normalized = normalizeReply(result.reply, source);
      normalized.state = result.state;
      setChatMessages((current) => [...current, normalized]);
      await reloadSnapshot();
    } catch (caught) {
      const messageBody = caught instanceof Error ? caught.message : "Chat failed.";
      setChatMessages((current) => [
        ...current,
        {
          id: makeId("msg"),
          role: "agent",
          title: "Message did not complete",
          body: messageBody,
          source: "local-vault",
          consensusState: "degraded"
        }
      ]);
      setError(messageBody);
    } finally {
      setChatSending(false);
    }
  }

  async function onSubagentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot?.agent) return;
    const form = new FormData(event.currentTarget);
    try {
      const deployed = await deploySubagentWithUserKey({
        password: String(form.get("password") ?? ""),
        primaryAgentAddress: snapshot.agent.contractAddress,
        name: String(form.get("name") ?? ""),
        archetype: String(form.get("archetype") ?? "briefing"),
        role: String(form.get("role") ?? "")
      });
      await registerSubagent({
        name: String(form.get("name") ?? ""),
        archetype: String(form.get("archetype") ?? "briefing"),
        role: String(form.get("role") ?? ""),
        ...deployed
      });
      setSnapshot(await getSnapshot());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Subagent deployment failed.");
    }
  }

  if (loadingSnapshot) {
    return (
      <AppShell section={section}>
        <LoadingWorkspace />
      </AppShell>
    );
  }

  if (!snapshot?.agent) {
    return (
      <AppShell section={section}>
        <section className="panel surface setup-card">
          <div className="eyebrow">First mission</div>
          <h1>Create your companion workspace</h1>
          <p className="muted">Start with the vault activation and first mission. Once the agent is live, this surface becomes its chat, task, briefing, specialist, and audit workspace.</p>
          <a className="button primary" href="/create-agent">Create companion</a>
        </section>
        {error ? <div className="error-text">{error}</div> : null}
      </AppShell>
    );
  }

  const onboardingSteps = [
    {
      title: "Workspace opened",
      done: Boolean(snapshot.agent),
      detail: "Your private companion identity is live."
    },
    {
      title: "Mission locked",
      done: Boolean(firstGoal),
      detail: firstGoal ? `${firstGoal.topic}: ${firstGoal.objective}` : "Choose one topic and a practical outcome."
    },
    {
      title: "First return",
      done: Boolean(latestBriefing),
      detail: latestBriefing ? latestBriefing.title : "Your first useful return appears after the first briefing run."
    }
  ];

  return (
    <AppShell section={section}>
      <SectionHeader
        eyebrow={pitch.eyebrow}
        title={section === "dashboard" ? snapshot.agent.name : pitch.title}
        detail={section === "dashboard" ? `A ${snapshot.agent.archetype.replace("-", " ")} companion with ${snapshot.agent.subagents.length} focused specialists.` : pitch.detail}
      />

      {section !== "dashboard" ? <SectionIntro section={section} /> : null}

      {section === "dashboard" ? (
        <>
          <section className="panel surface onboarding-strip">
            <div>
              <div className="pill">New user guide</div>
              <h2>How GenFren earns the next visit</h2>
              <p className="muted">One focused mission, contract-backed reasoning when the backend is online, and an audit trail that keeps every autonomous action inspectable.</p>
            </div>
            <div className="onboarding-grid">
              {onboardingSteps.map((step) => (
                <div className="onboarding-card" key={step.title}>
                  <div className={`step-badge${step.done ? " complete" : ""}`}>{step.done ? "Done" : "Next"}</div>
                  <strong>{step.title}</strong>
                  <div className="muted">{step.detail}</div>
                </div>
              ))}
            </div>
          </section>
          <div className="cards-3">
            <MetricCard label="Status" value={snapshot.payment?.status === "confirmed" ? "Ready" : "Waiting"} meta={snapshot.payment?.status === "confirmed" ? "Your companion is unlocked." : "Activation is still pending."} />
            <MetricCard label="Focus" value={firstGoal?.topic ?? "No focus yet"} meta={firstGoal?.objective ?? "Create your first mission"} />
            <MetricCard label="In motion" value={`${activeTasks.length}`} meta="Autonomous work you can inspect" />
          </div>
          <div className="cards-2">
            <section className="panel surface">
              <div className="mini-label">Latest return</div>
              {latestBriefing ? (
                <>
                  <strong>{latestBriefing.title}</strong>
                  <p className="muted">{latestBriefing.summary}</p>
                  <div className="cta-row">
                    <span className="pill">{latestBriefing.confidence} confidence</span>
                    <span className="pill">{formatConsensusState(latestBriefing.consensusState)}</span>
                  </div>
                </>
              ) : (
                <EmptyFeature title="No briefing yet" detail="Your companion is ready. The first useful return appears after the scheduled monitoring task runs." />
              )}
            </section>
            <section className="panel surface">
              <div className="mini-label">Recent agent activity</div>
              <div className="audit-timeline compact">
                {(snapshot.auditLogs ?? []).slice(0, 4).map((log) => (
                  <div className="audit-row" key={log.id}>
                    <span className="audit-dot" />
                    <div>
                      <strong>{humanizeAction(log.action)}</strong>
                      <p className="muted">{new Date(log.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {(snapshot.auditLogs ?? []).length === 0 ? (
                  <EmptyFeature title="No audit events yet" detail="Agent actions will appear here as the workspace starts moving." />
                ) : null}
              </div>
            </section>
          </div>
        </>
      ) : null}

      {section === "agent" ? (
        <section className="panel surface chat">
          <div className="chat-status-row">
            <span className="pill">{sourceMode === "contract" ? "Contract-backed" : "Local vault mode"}</span>
            <span className="pill">{chatSending ? "Running reasoning" : "Ready"}</span>
          </div>
          <div className="chat-log">
            {chatMessages.map((message) => (
              <div className={`chat-bubble ${message.role === "agent" ? "agent" : "user"}`} key={message.id}>
                {message.title ? <strong>{message.title}</strong> : null}
                <div className="muted">{message.body}</div>
                {message.role === "agent" ? (
                  <div className="cta-row chat-meta">
                    {message.source ? <span className="pill">{message.source === "contract" ? "contract-backed" : "offline/local"}</span> : null}
                    {message.confidence ? <span className="pill">{message.confidence} confidence</span> : null}
                    {message.consensusState ? <span className="pill">{formatConsensusState(message.consensusState)}</span> : null}
                    {message.state?.map((state) => <span className="pill" key={state}>{state}</span>)}
                  </div>
                ) : null}
              </div>
            ))}
            {chatSending ? <div className="chat-bubble agent loading-bubble">Retrieving memory, running consensus, and preparing your reply...</div> : null}
          </div>
          <form className="input-row" onSubmit={onChatSubmit}>
            <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask GenFren to continue a thread, summarize, or refocus." />
            <button className="button primary" disabled={chatSending || !chatInput.trim()} type="submit">{chatSending ? "Sending" : "Send"}</button>
          </form>
        </section>
      ) : null}

      {section === "briefings" ? (
        <div className="list">
          {snapshot.briefings.length > 0 ? snapshot.briefings.map((briefing) => (
            <section className="panel surface" key={briefing.id}>
              <div className="page-header">
                <div>
                  <strong>{briefing.title}</strong>
                  <div className="muted">{new Date(briefing.createdAt).toLocaleString()}</div>
                </div>
                <div className="cta-row">
                  <span className="pill">{briefing.confidence}</span>
                  <span className="pill">{formatConsensusState(briefing.consensusState)}</span>
                </div>
              </div>
              <p className="muted">{briefing.summary}</p>
            </section>
          )) : <EmptyFeature title="No briefings yet" detail="GenFren will collect approved evidence, reason through the contract path, and return with concise updates tied to your mission." />}
        </div>
      ) : null}

      {section === "tasks" ? (
        <div className="list">
          {snapshot.tasks.length > 0 ? snapshot.tasks.map((task) => (
            <section className="panel surface" key={task.id}>
              <div className="row-line">
                <strong>{task.name}</strong>
                <span className="pill">{task.status}</span>
              </div>
              <div className="muted">{task.lastResult || "Waiting for the next run."}</div>
            </section>
          )) : <EmptyFeature title="No scheduled runs yet" detail="Autonomous tasks will appear here once your mission has a cadence and the worker schedules its first return." />}
        </div>
      ) : null}

      {section === "audit" ? (
        <div className="audit-timeline">
          {(snapshot.auditLogs ?? []).length > 0 ? (snapshot.auditLogs ?? []).map((log) => (
            <section className="panel surface audit-entry" key={log.id}>
              <span className="audit-dot" />
              <div>
                <div className="row-line">
                  <strong>{humanizeAction(log.action)}</strong>
                  <span className="pill">{log.actorType}</span>
                </div>
                <p className="muted">{new Date(log.createdAt).toLocaleString()}</p>
                {Object.keys(log.payload ?? {}).length > 0 ? <code>{JSON.stringify(log.payload)}</code> : null}
              </div>
            </section>
          )) : <EmptyFeature title="No audit events yet" detail="As your agent deploys, reasons, registers specialists, and completes briefings, the important events will collect here." />}
        </div>
      ) : null}

      {section === "subagents" ? (
        <div className="cards-2">
          <section className="panel surface">
            <h2>Add a specialist</h2>
            <p className="muted">Specialists are narrow helpers. Give each one a job that is specific enough to stay useful.</p>
            <form className="form-grid" onSubmit={onSubagentSubmit}>
              <input name="name" placeholder="Specialist name" required />
              <select name="archetype" defaultValue="briefing">
                <option value="briefing">Briefing</option>
                <option value="research">Research</option>
                <option value="goal-coach">Goal coach</option>
                <option value="project-tracker">Project tracker</option>
                <option value="content-draft">Writing partner</option>
              </select>
              <textarea name="role" placeholder="What should this specialist quietly handle for you?" rows={4} required />
              <input name="password" type="password" placeholder="Vault password" required />
              <button className="button primary" type="submit">Add specialist</button>
            </form>
          </section>
          <section className="panel surface">
            <h2>Your specialist team</h2>
            <div className="list">
              {snapshot.agent.subagents.length > 0 ? snapshot.agent.subagents.map((subagent) => (
                <div className="panel surface" key={subagent.id}>
                  <div className="row-line">
                    <strong>{subagent.name}</strong>
                    <span className="pill">{subagent.status}</span>
                  </div>
                  <div className="muted">{subagent.role}</div>
                </div>
              )) : <EmptyFeature title="No specialists yet" detail="Add one when your main mission branches into a repeatable side job like research, drafting, or progress tracking." />}
            </div>
          </section>
        </div>
      ) : null}

      {error ? <div className="error-text">{error}</div> : null}
    </AppShell>
  );
}
