import type { AgentSnapshot, AgentRecord, AutonomyPolicy, Briefing, DelegationGrant, Goal, MemoryItem, PaymentReceipt, SubAgent, TaskRun, User } from "@genfren/shared";

import { query } from "../lib/db.js";

export async function getUserByUsername(username: string) {
  const result = await query<User & { password_hash: string; encrypted_private_key: string; encrypted_private_key_nonce: string; vault_salt: string }>(
    `select id, username, email, wallet_address as "walletAddress", status, password_hash, encrypted_private_key, encrypted_private_key_nonce, vault_salt
     from users where username = $1`,
    [username]
  );
  return result.rows[0] ?? null;
}

export async function getUserById(userId: string) {
  const result = await query<User>(
    `select id, username, email, wallet_address as "walletAddress", status, created_at as "createdAt"
     from users where id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function getCurrentPayment(userId: string) {
  const result = await query<PaymentReceipt>(
    `select id, user_id as "userId", network, amount_gen::float as "amountGen",
            treasury_address as "treasuryAddress", sender_address as "senderAddress",
            tx_hash as "txHash", confirmed_at as "confirmedAt", status,
            rejection_reason as "rejectionReason"
     from payment_receipts
     where user_id = $1
     order by created_at desc limit 1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function getCurrentAgent(userId: string) {
  const result = await query<AgentRecord & { factoryContractAddress: string }>(
    `select a.id, a.owner_id as "ownerId", a.name, a.archetype, a.status, a.contract_address as "contractAddress",
            a.factory_contract_address as "factoryContractAddress"
     from agents a where owner_id = $1
     order by created_at desc limit 1`,
    [userId]
  );
  const agent = result.rows[0];
  if (!agent) return null;

  const [subagents, goals, policy] = await Promise.all([
    query(`select id, name, archetype, role, status, contract_address as "contractAddress" from subagents where agent_id = $1 order by created_at desc`, [agent.id]),
    query(`select id, topic, objective, source_urls as "sourceUrls", cadence, tone, status from goals where agent_id = $1 order by created_at desc`, [agent.id]),
    query(`select max_daily_runs as "maxDailyRuns", max_active_subagents as "maxActiveSubagents",
                  allowed_source_classes as "allowedSourceClasses",
                  can_draft_content as "canDraftContent", can_create_subagents as "canCreateSubagents",
                  can_schedule_monitoring as "canScheduleMonitoring"
           from autonomy_policies where agent_id = $1`, [agent.id])
  ]);

  return {
    ...agent,
    subagents: subagents.rows as unknown as SubAgent[],
    goals: goals.rows as unknown as Goal[],
    policy: (policy.rows[0] ?? {
      maxDailyRuns: 8,
      maxActiveSubagents: 3,
      allowedSourceClasses: ["official-docs", "company-sites", "public-apis"],
      canDraftContent: true,
      canCreateSubagents: true,
      canScheduleMonitoring: true
    }) as unknown as AutonomyPolicy
  };
}

export async function getSnapshot(userId: string): Promise<AgentSnapshot> {
  const [user, payment, agent] = await Promise.all([
    getUserById(userId),
    getCurrentPayment(userId),
    getCurrentAgent(userId)
  ]);
  if (!user) {
    throw new Error("User not found.");
  }
  if (!agent) {
    return {
      user,
      payment,
      agent: null,
      briefings: [],
      tasks: [],
      memory: [],
      delegation: []
    };
  }

  const [briefings, tasks, memory, delegation] = await Promise.all([
    query<Briefing>(
      `select id, agent_id as "agentId", goal_id as "goalId", title, summary, confidence,
              consensus_state as "consensusState", source_refs as "sourceRefs", created_at as "createdAt"
       from briefings where agent_id = $1 order by created_at desc limit 20`,
      [agent.id]
    ),
    query<TaskRun>(
      `select tr.id, tr.task_id as "taskId", t.name, tr.status, tr.scheduled_for as "scheduledFor",
              tr.result_summary as "lastResult"
       from task_runs tr join tasks t on t.id = tr.task_id
       where t.agent_id = $1 order by tr.scheduled_for desc limit 20`,
      [agent.id]
    ),
    query<MemoryItem>(
      `select id, type, summary, importance, created_at as "createdAt"
       from memory_items where agent_id = $1 order by created_at desc limit 20`,
      [agent.id]
    ),
    query<DelegationGrant>(
      `select id, delegate_handle as handle, delegate_address as "delegateAddress",
              role, created_at as "grantedAt"
       from delegations where agent_id = $1 and revoked_at is null order by created_at desc`,
      [agent.id]
    )
  ]);

  return {
    user,
    payment,
    agent,
    briefings: briefings.rows,
    tasks: tasks.rows,
    memory: memory.rows,
    delegation: delegation.rows
  };
}
