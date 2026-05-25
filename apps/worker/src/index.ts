import "dotenv/config";

import { Job, Worker } from "bullmq";

import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { query } from "../../api/src/lib/db.js";
import { acquireLeadershipLock, redis, releaseLeadershipLock, renewLeadershipLock } from "../../api/src/lib/redis.js";
import { config } from "../../api/src/config.js";
import { ensureBriefingSchedule, storeMemory, writeAuditLog } from "../../api/src/services/agent.js";
import { reasonWithAgent } from "../../api/src/services/genlayer.js";

async function processPayment(job: Job<{ paymentId: string }>) {
  const { refreshPayment } = await import("../../api/src/services/payment.js");
  return refreshPayment(job.data.paymentId);
}

async function processBriefing(job: Job<{ agentId: string; goalId: string; taskId: string }>) {
  const runId = `run_${job.id}`;
  await query(
    `insert into task_runs (id, task_id, scheduled_for, started_at, status)
     values ($1, $2, now(), now(), 'running')`,
    [runId, job.data.taskId]
  );

  try {
    const agentResult = await query<{ contractAddress: string; ownerId: string }>(
      `select contract_address as "contractAddress", owner_id as "ownerId" from agents where id = $1`,
      [job.data.agentId]
    );
    const goalResult = await query<{ topic: string; objective: string; sourceUrls: string[] }>(
      `select topic, objective, source_urls as "sourceUrls" from goals where id = $1`,
      [job.data.goalId]
    );
    const memoryResult = await query<{ summary: string }>(
      `select summary from memory_items where agent_id = $1 order by created_at desc limit 5`,
      [job.data.agentId]
    );
    const agent = agentResult.rows[0];
    const goal = goalResult.rows[0];
    if (!agent || !goal) throw new Error("Agent or goal missing.");

    const evidence: Array<{ url: string; title: string; excerpt: string }> = [];
    for (const url of goal.sourceUrls.slice(0, 5)) {
      const response = await fetch(url);
      const text = await response.text();
      const excerpt = text.replace(/\s+/g, " ").slice(0, 1800);
      evidence.push({ url, title: url, excerpt });
      await query(
        `insert into source_evidence (id, task_run_id, agent_id, source_url, title, excerpt, content_hash)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          `src_${createHash("sha256").update(`${runId}:${url}`).digest("hex").slice(0, 20)}`,
          runId,
          job.data.agentId,
          url,
          url,
          excerpt,
          createHash("sha256").update(excerpt).digest("hex")
        ]
      );
    }

    const reasoning = await reasonWithAgent({
      contractAddress: agent.contractAddress,
      goalContext: `${goal.topic}: ${goal.objective}`,
      memoryContext: memoryResult.rows.map((row: { summary: string }) => row.summary).join("\n"),
      evidenceJson: JSON.stringify(evidence),
      userMessage: `Prepare the scheduled ${goal.topic} briefing.`
    }) as Record<string, any>;

    const briefingId = `brf_${job.id}`;
    await query(
      `insert into briefings (id, agent_id, goal_id, title, summary, confidence, consensus_state, source_refs)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        briefingId,
        job.data.agentId,
        job.data.goalId,
        reasoning.title,
        reasoning.summary,
        reasoning.confidence,
        reasoning.consensus_state,
        JSON.stringify(evidence.map((item) => ({ url: item.url, title: item.title })))
      ]
    );
    await storeMemory(job.data.agentId, "short-term", reasoning.summary, "medium", briefingId);
    await query(
      `insert into notifications (id, user_id, agent_id, type, title, body)
       values ($1, $2, $3, 'briefing', $4, $5)`,
      [`ntf_${job.id}`, agent.ownerId, job.data.agentId, reasoning.title, reasoning.summary]
    );
    await query(
      `update task_runs set completed_at = now(), status = 'completed', result_summary = $2 where id = $1`,
      [runId, reasoning.summary]
    );
    await writeAuditLog({
      actorType: "worker",
      actorId: config.SERVICE_NAME,
      agentId: job.data.agentId,
      action: "briefing.completed",
      payload: {
        taskId: job.data.taskId,
        runId,
        title: reasoning.title,
        confidence: reasoning.confidence,
        consensusState: reasoning.consensus_state
      }
    });
    return reasoning;
  } catch (error) {
    await query(
      `update task_runs set completed_at = now(), status = 'failed', error_code = $2 where id = $1`,
      [runId, error instanceof Error ? error.message : "unknown_error"]
    );
    await writeAuditLog({
      actorType: "worker",
      actorId: config.SERVICE_NAME,
      agentId: job.data.agentId,
      action: "briefing.failed",
      payload: {
        taskId: job.data.taskId,
        runId,
        error: error instanceof Error ? error.message : "unknown_error"
      }
    });
    throw error;
  }
}

new Worker("payment-verification", processPayment, {
  connection: redis
});

new Worker("goal-briefing", processBriefing, {
  connection: redis
});

const leaderId = `${config.SERVICE_NAME}-${randomUUID()}`;
const leadershipKey = "genfren:scheduler:leader";
const leadershipTtlSeconds = 30;
let isLeader = false;

async function reconcileScheduledTasks() {
  const tasks = await query<{ id: string; agentId: string; goalId: string; cadence: "daily" | "weekly" }>(
    `select t.id, t.agent_id as "agentId", t.goal_id as "goalId", t.cadence
     from tasks t
     join goals g on g.id = t.goal_id
     where t.status = 'scheduled' and g.status = 'active'`
  );

  await Promise.all(
    tasks.rows
      .filter((task) => task.goalId)
      .map((task) =>
        ensureBriefingSchedule(
          task.id,
          { agentId: task.agentId, goalId: task.goalId, taskId: task.id },
          task.cadence
        )
      )
  );
}

async function runLeadershipLoop() {
  const acquired = isLeader
    ? await renewLeadershipLock(leadershipKey, leaderId, leadershipTtlSeconds)
    : await acquireLeadershipLock(leadershipKey, leaderId, leadershipTtlSeconds);

  isLeader = acquired;
  if (!isLeader) return;

  try {
    await reconcileScheduledTasks();
  } catch (error) {
    console.error("[genfren-worker] scheduler reconciliation failed", error);
  }
}

setInterval(() => {
  void runLeadershipLoop();
}, 10_000);

void runLeadershipLoop();

process.on("SIGTERM", () => {
  void releaseLeadershipLock(leadershipKey, leaderId).finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  void releaseLeadershipLock(leadershipKey, leaderId).finally(() => process.exit(0));
});

const client = createClient({ chain: config.STUDIONET_RPC_URL ? { ...studionet, rpcUrls: { ...studionet.rpcUrls, default: { http: [config.STUDIONET_RPC_URL] } } } : studionet });

console.log("[genfren-worker] running", {
  studionet: client.chain.rpcUrls.default.http[0],
  role: config.SERVICE_ROLE,
  leaderId
});
