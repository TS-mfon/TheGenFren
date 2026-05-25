import type { AgentArchetype, DelegationRole } from "@genfren/shared";

import { briefingQueue } from "../lib/redis.js";
import { query } from "../lib/db.js";
import { makeId } from "../lib/ids.js";
import {
  authorizePaymentOnFactory,
  deployFactoryIfNeeded,
  deployPrimaryAgent,
  reasonWithAgent,
  registerPrimaryAgentOnFactory,
  sha256
} from "./genlayer.js";
import { getCurrentAgent, getCurrentPayment, getSnapshot, getUserById } from "./snapshot.js";

const templatePrompts: Record<AgentArchetype, string> = {
  research: "Persistent research specialist focused on approved evidence and concise synthesis.",
  briefing: "Recurring briefer that turns evidence into useful, confidence-scored updates.",
  "goal-coach": "Goal coach that tracks progress, drift, and next actions over time.",
  "project-tracker": "Project tracker that remembers unfinished work and ties new evidence to open threads.",
  "content-draft": "Content drafter that turns approved evidence into clear, accurate drafts."
};

function cadenceToRepeatMs(cadence: "daily" | "weekly") {
  return cadence === "daily" ? 86_400_000 : 604_800_000;
}

export async function ensureBriefingSchedule(taskId: string, job: { agentId: string; goalId: string; taskId: string }, cadence: "daily" | "weekly") {
  await briefingQueue.add("goal-briefing", job, {
    jobId: `task:${taskId}`,
    repeat: { every: cadenceToRepeatMs(cadence) }
  });
}

export async function writeAuditLog(args: {
  actorType: "user" | "agent" | "system" | "worker";
  actorId: string;
  agentId?: string | null;
  action: string;
  payload?: Record<string, unknown>;
}) {
  await query(
    `insert into audit_logs (id, actor_type, actor_id, agent_id, action, payload)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      makeId("aud"),
      args.actorType,
      args.actorId,
      args.agentId ?? null,
      args.action,
      JSON.stringify(args.payload ?? {})
    ]
  );
}

export async function createAgentForUser(args: {
  userId: string;
  name: string;
  archetype: AgentArchetype;
  topic: string;
  objective: string;
  sourceUrls: string[];
  tone: "concise" | "analytical" | "casual";
  cadence: "daily" | "weekly";
}) {
  const user = await getUserById(args.userId);
  if (!user) throw new Error("User not found.");
  const payment = await getCurrentPayment(args.userId);
  if (!payment || payment.status !== "confirmed") {
    throw new Error("Bradbury payment must be confirmed before agent creation.");
  }
  const existing = await getCurrentAgent(args.userId);
  if (existing) {
    return existing;
  }

  const factory = await deployFactoryIfNeeded();
  await authorizePaymentOnFactory(factory.contractAddress, payment.txHash, user.walletAddress);

  const deployment = await deployPrimaryAgent({
    ownerAddress: user.walletAddress,
    factoryAddress: factory.contractAddress,
    name: args.name,
    archetype: args.archetype,
    systemPrompt: templatePrompts[args.archetype]
  });

  await registerPrimaryAgentOnFactory({
    factoryAddress: factory.contractAddress,
    beneficiary: user.walletAddress,
    paymentTxHash: payment.txHash,
    archetype: args.archetype,
    contractAddress: deployment.contractAddress
  });

  const agentId = makeId("agt");
  const goalId = makeId("goal");
  const taskId = makeId("task");

  await query("begin");
  try {
    await query(
      `insert into agents (id, owner_id, name, archetype, status, contract_address, factory_contract_address)
       values ($1, $2, $3, $4, 'active', $5, $6)`,
      [agentId, user.id, args.name, args.archetype, deployment.contractAddress, factory.contractAddress]
    );
    await query(
      `insert into deployments (id, user_id, agent_id, network, kind, tx_hash, contract_address, status, metadata)
       values ($1, $2, $3, 'studionet', 'primary-agent', $4, $5, 'accepted', $6::jsonb)`,
      [makeId("dep"), user.id, agentId, deployment.txHash, deployment.contractAddress, JSON.stringify({ receipt: deployment.receipt })]
    );
    await query(
      `insert into autonomy_policies
       (agent_id, max_daily_runs, max_active_subagents, allowed_source_classes, can_draft_content, can_create_subagents, can_schedule_monitoring)
       values ($1, 8, 3, $2, true, true, true)`,
      [agentId, ["official-docs", "company-sites", "public-apis"]]
    );
    await query(
      `insert into goals (id, agent_id, topic, objective, source_urls, cadence, tone, status)
       values ($1, $2, $3, $4, $5, $6, $7, 'active')`,
      [goalId, agentId, args.topic, args.objective, args.sourceUrls, args.cadence, args.tone]
    );
    await query(
      `insert into tasks (id, agent_id, goal_id, name, kind, cadence, status)
       values ($1, $2, $3, $4, 'briefing', $5, 'scheduled')`,
      [taskId, agentId, goalId, `${args.topic} monitoring`, args.cadence]
    );
    await query(
      `insert into notifications (id, user_id, agent_id, type, title, body)
       values ($1, $2, $3, 'deployment', 'Primary agent deployed', $4)`,
      [makeId("ntf"), user.id, agentId, `${args.name} is live on StudioNet.`]
    );
    await writeAuditLog({
      actorType: "system",
      actorId: user.id,
      agentId,
      action: "agent.primary.deployed",
      payload: {
        name: args.name,
        archetype: args.archetype,
        topic: args.topic,
        cadence: args.cadence,
        contractAddress: deployment.contractAddress,
        deploymentTxHash: deployment.txHash
      }
    });
    await query("commit");
  } catch (error) {
    await query("rollback");
    throw error;
  }

  await ensureBriefingSchedule(taskId, { agentId, goalId, taskId }, args.cadence);

  return getCurrentAgent(args.userId);
}

export async function chatWithAgent(userId: string, message: string) {
  const agent = await getCurrentAgent(userId);
  if (!agent) throw new Error("Agent not found.");
  const memory = await query<{ summary: string }>(
    `select summary from memory_items where agent_id = $1 order by created_at desc limit 5`,
    [agent.id]
  );
  const evidence = await query<{ source_url: string; title: string; excerpt: string }>(
    `select se.source_url, se.title, se.excerpt
     from source_evidence se
     join task_runs tr on tr.id = se.task_run_id
     join tasks t on t.id = tr.task_id
     where t.agent_id = $1
     order by se.fetched_at desc limit 5`,
    [agent.id]
  );
  const goal = agent.goals[0];
  const reasoning = await reasonWithAgent({
    contractAddress: agent.contractAddress,
    goalContext: `${goal.topic}: ${goal.objective}`,
    memoryContext: memory.rows.map((row: { summary: string }) => row.summary).join("\n"),
    evidenceJson: JSON.stringify(evidence.rows),
    userMessage: message
  });

  const branchSummary = typeof reasoning === "object" ? JSON.stringify(reasoning) : String(reasoning);
  await query(
    `insert into conversation_branches (id, agent_id, branch_key, summary)
     values ($1, $2, 'primary', $3)
     on conflict do nothing`,
    [makeId("brn"), agent.id, branchSummary]
  );
  await writeAuditLog({
    actorType: "agent",
    actorId: agent.id,
    agentId: agent.id,
    action: "agent.chat.reasoned",
    payload: {
      source: "contract",
      contractAddress: agent.contractAddress,
      messageLength: message.length,
      replyTitle: typeof reasoning === "object" && reasoning !== null && "title" in reasoning ? String((reasoning as { title?: unknown }).title ?? "") : "Agent reply",
      confidence: typeof reasoning === "object" && reasoning !== null && "confidence" in reasoning ? String((reasoning as { confidence?: unknown }).confidence ?? "") : "",
      consensusState: typeof reasoning === "object" && reasoning !== null && "consensus_state" in reasoning ? String((reasoning as { consensus_state?: unknown }).consensus_state ?? "") : ""
    }
  });

  return {
    reply: reasoning,
    state: ["retrieving memory", "running consensus", "updating memory"],
    source: "contract",
    contractAddress: agent.contractAddress
  };
}

export async function registerSubagent(args: {
  userId: string;
  name: string;
  archetype: AgentArchetype;
  role: string;
  contractAddress: string;
  deploymentTxHash: string;
  registerTxHash: string;
}) {
  const agent = await getCurrentAgent(args.userId);
  if (!agent) throw new Error("Primary agent not found.");
  const subagentId = makeId("sub");
  await query("begin");
  try {
    await query(
      `insert into subagents (id, agent_id, name, archetype, role, contract_address, status)
       values ($1, $2, $3, $4, $5, $6, 'active')`,
      [subagentId, agent.id, args.name, args.archetype, args.role, args.contractAddress]
    );
    await query(
      `insert into deployments (id, user_id, agent_id, subagent_id, network, kind, tx_hash, contract_address, status)
       values ($1, $2, $3, $4, 'studionet', 'subagent', $5, $6, 'accepted')`,
      [makeId("dep"), args.userId, agent.id, subagentId, args.deploymentTxHash, args.contractAddress]
    );
    await query(
      `insert into notifications (id, user_id, agent_id, type, title, body)
       values ($1, $2, $3, 'subagent', 'Subagent registered', $4)`,
      [makeId("ntf"), args.userId, agent.id, `${args.name} is live and linked to your primary agent.`]
    );
    await writeAuditLog({
      actorType: "user",
      actorId: args.userId,
      agentId: agent.id,
      action: "agent.subagent.registered",
      payload: {
        name: args.name,
        archetype: args.archetype,
        contractAddress: args.contractAddress,
        deploymentTxHash: args.deploymentTxHash,
        registerTxHash: args.registerTxHash
      }
    });
    await query("commit");
  } catch (error) {
    await query("rollback");
    throw error;
  }
  return { subagentId, registerTxHash: args.registerTxHash };
}

export async function grantDelegation(userId: string, input: { handle: string; address: string; role: DelegationRole }) {
  const agent = await getCurrentAgent(userId);
  if (!agent) throw new Error("Primary agent not found.");
  const id = makeId("dlg");
  await query(
    `insert into delegations (id, agent_id, owner_id, delegate_handle, delegate_address, role)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, agent.id, userId, input.handle, input.address, input.role]
  );
  await writeAuditLog({ actorType: "user", actorId: userId, agentId: agent.id, action: "delegation.grant", payload: input });
  return getSnapshot(userId);
}

export async function storeMemory(agentId: string, type: string, summary: string, importance: "high" | "medium" | "low", briefingId?: string) {
  await query(
    `insert into memory_items (id, agent_id, type, summary, importance, memory_hash, source_briefing_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [makeId("mem"), agentId, type, summary, importance, sha256(summary), briefingId ?? null]
  );
}
