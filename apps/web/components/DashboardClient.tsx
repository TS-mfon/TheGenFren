"use client";

import { useEffect, useState } from "react";

import type { AgentSnapshot } from "@genfren/shared";

import { chatWithAgent, getSnapshot, grantDelegation, registerSubagent } from "../lib/api";
import { deploySubagentWithUserKey } from "../lib/vault";
import { AppShell } from "./AppShell";
import { MetricCard } from "./MetricCard";
import { SectionHeader } from "./SectionHeader";

function formatConsensusState(state: string) {
  if (state === "verified") return "settled";
  if (state === "degraded") return "limited";
  return state;
}

export function DashboardClient({ section }: { section: "dashboard" | "agent" | "briefings" | "tasks" | "subagents" | "delegation" | "memory" }) {
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [error, setError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatReply, setChatReply] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    getSnapshot().then(setSnapshot).catch((caught) => setError(caught instanceof Error ? caught.message : "Failed to load snapshot."));
  }, []);

  async function onChatSubmit() {
    if (!chatInput.trim()) return;
    try {
      const result = await chatWithAgent(chatInput);
      setChatReply(result.reply);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chat failed.");
    }
  }

  async function onDelegationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const updated = await grantDelegation({
        handle: String(form.get("handle") ?? ""),
        address: String(form.get("address") ?? ""),
        role: String(form.get("role") ?? "operator")
      });
      setSnapshot(updated as AgentSnapshot);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delegation failed.");
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Subagent deployment failed.");
    }
  }

  const firstGoal = snapshot?.agent?.goals[0];
  const latestBriefing = snapshot?.briefings[0];
  const onboardingSteps = [
    {
      title: "Open your private workspace",
      done: Boolean(snapshot?.agent),
      detail: "Your companion, memory, and working threads live together here."
    },
    {
      title: "Set a living focus",
      done: Boolean(firstGoal),
      detail: firstGoal ? `${firstGoal.topic}: ${firstGoal.objective}` : "Choose one topic and a practical outcome."
    },
    {
      title: "Wait for the first return",
      done: Boolean(latestBriefing),
      detail: latestBriefing ? latestBriefing.title : "Your first update appears here once the system has something useful."
    }
  ];

  return (
    <AppShell section={section}>
      {snapshot?.agent ? (
        <>
          <SectionHeader
            eyebrow={section === "dashboard" ? "Today" : section}
            title={snapshot.agent.name}
            detail={`A ${snapshot.agent.archetype.replace("-", " ")} companion with ${snapshot.agent.subagents.length} supporting specialists.`}
          />
          {section === "dashboard" ? (
            <>
              <section className="panel surface onboarding-strip">
                <div>
                  <div className="pill">New user guide</div>
                  <h2>How GenFren works for you</h2>
                  <p className="muted">Keep one clear focus, let the companion return with updates, and add specialists only when the work genuinely branches.</p>
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
                <MetricCard label="Focus" value={snapshot.agent.goals[0]?.topic ?? "No focus yet"} meta={snapshot.agent.goals[0]?.objective ?? "Create your first mission"} />
                <MetricCard label="Support team" value={`${snapshot.agent.subagents.length}`} meta="Specialists helping behind the scenes" />
              </div>
              <div className="cards-2">
                <section className="panel surface">
                  <h2>Latest return</h2>
                  {snapshot.briefings[0] ? (
                    <>
                      <strong>{snapshot.briefings[0].title}</strong>
                      <p className="muted">{snapshot.briefings[0].summary}</p>
                      <div className="cta-row">
                        <span className="pill">{snapshot.briefings[0].confidence} confidence</span>
                        <span className="pill">{formatConsensusState(snapshot.briefings[0].consensusState)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="muted">Your companion has not delivered a first update yet.</div>
                  )}
                </section>
                <section className="panel surface">
                  <h2>What is in motion</h2>
                  <div className="list">
                    {snapshot.tasks.map((task) => (
                      <div className="row-line" key={task.id}>
                        <strong>{task.name}</strong>
                        <span className="pill">{task.status}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          ) : null}
          {section === "agent" ? (
            <section className="panel surface chat">
              <div className="chat-log">
                <div className="chat-bubble">
                  Pick up where we left off and tell me what changed since the last update.
                </div>
                {chatReply ? (
                  <div className="chat-bubble agent">
                    <strong>{String(chatReply.title ?? "Agent reply")}</strong>
                    <div className="muted">{String(chatReply.summary ?? "")}</div>
                  </div>
                ) : null}
              </div>
              <div>
                <div className="input-row">
                  <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask GenFren to continue a thread, summarize, or refocus." />
                  <button className="button primary" onClick={onChatSubmit}>Send</button>
                </div>
              </div>
            </section>
          ) : null}
          {section === "briefings" ? (
            <div className="list">
              {snapshot.briefings.map((briefing) => (
                <section className="panel surface" key={briefing.id}>
                  <div className="page-header">
                    <div>
                      <strong>{briefing.title}</strong>
                      <div className="muted">{briefing.createdAt}</div>
                    </div>
                    <div className="cta-row">
                      <span className="pill">{briefing.confidence}</span>
                      <span className="pill">{formatConsensusState(briefing.consensusState)}</span>
                    </div>
                  </div>
                  <p className="muted">{briefing.summary}</p>
                </section>
              ))}
            </div>
          ) : null}
          {section === "tasks" ? (
            <div className="list">
              {snapshot.tasks.map((task) => (
                <section className="panel surface" key={task.id}>
                  <div className="row-line">
                    <strong>{task.name}</strong>
                    <span className="pill">{task.status}</span>
                  </div>
                  <div className="muted">{task.lastResult}</div>
                </section>
              ))}
            </div>
          ) : null}
          {section === "memory" ? (
            <div className="list">
              {snapshot.memory.map((item) => (
                <section className="panel surface" key={item.id}>
                  <div className="row-line">
                    <strong>{item.type}</strong>
                    <span className="pill">{item.importance}</span>
                  </div>
                  <div className="muted">{item.summary}</div>
                </section>
              ))}
            </div>
          ) : null}
          {section === "delegation" ? (
            <div className="cards-2">
              <section className="panel surface">
                <h2>Invite someone in</h2>
                <form className="form-grid" onSubmit={onDelegationSubmit}>
                  <input name="handle" placeholder="Name or label" required />
                  <input name="address" placeholder="Access key" required />
                  <select name="role" defaultValue="operator">
                    <option value="viewer">Viewer</option>
                    <option value="operator">Operator</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="button primary" type="submit">Grant</button>
                </form>
              </section>
              <section className="panel surface">
                <h2>Current access</h2>
                <div className="list">
                  {snapshot.delegation.map((item) => (
                    <div className="panel surface" key={item.id}>
                      <strong>{item.handle}</strong>
                      <div className="muted">Shared as {item.role}</div>
                      <span className="pill">{item.role}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
          {section === "subagents" ? (
            <div className="cards-2">
              <section className="panel surface">
                <h2>Add a specialist</h2>
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
                  {snapshot.agent.subagents.map((subagent) => (
                    <div className="panel surface" key={subagent.id}>
                      <div className="row-line">
                        <strong>{subagent.name}</strong>
                        <span className="pill">{subagent.status}</span>
                      </div>
                      <div className="muted">{subagent.role}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </>
      ) : (
        <section className="panel surface">
          <h1>Your companion is not created yet</h1>
          <p className="muted">Start with the vault and first mission, then come back here to a workspace that keeps its memory.</p>
        </section>
      )}
      {error ? <div className="error-text">{error}</div> : null}
    </AppShell>
  );
}
