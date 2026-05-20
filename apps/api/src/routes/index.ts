import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { CreateAgentPayload, LoginPayload, SignupPayload } from "@genfren/shared";

import { hashPassword, verifyPassword } from "../lib/auth.js";
import { query } from "../lib/db.js";
import { makeId } from "../lib/ids.js";
import { createAgentForUser, chatWithAgent, grantDelegation, registerSubagent } from "../services/agent.js";
import { getSnapshot, getUserByUsername } from "../services/snapshot.js";
import { refreshPayment, submitPayment } from "../services/payment.js";
import { readContract } from "../lib/contracts.js";
import { pool } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { config } from "../config.js";

type AuthenticatedRequest = FastifyRequest & { user: { sub: string } };

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: "Unauthorized" });
  }
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    const checks = {
      database: { ok: false as boolean, detail: "" },
      redis: { ok: false as boolean, detail: "" },
      studionetRpc: { ok: false as boolean, detail: "" },
      bradburyRpc: { ok: false as boolean, detail: "" }
    };

    try {
      await pool.query("select 1");
      checks.database = { ok: true, detail: "reachable" };
    } catch (error) {
      checks.database = { ok: false, detail: error instanceof Error ? error.message : "failed" };
    }

    try {
      const pong = await redis.ping();
      checks.redis = { ok: pong === "PONG", detail: pong };
    } catch (error) {
      checks.redis = { ok: false, detail: error instanceof Error ? error.message : "failed" };
    }

    async function checkRpc(url: string | undefined, label: "studionetRpc" | "bradburyRpc") {
      if (!url) {
        checks[label] = { ok: false, detail: "not configured" };
        return;
      }
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "web3_clientVersion",
            params: []
          })
        });
        checks[label] = { ok: response.ok, detail: `http_${response.status}` };
      } catch (error) {
        checks[label] = { ok: false, detail: error instanceof Error ? error.message : "failed" };
      }
    }

    await Promise.all([
      checkRpc(config.STUDIONET_RPC_URL, "studionetRpc"),
      checkRpc(config.BRADBURY_RPC_URL, "bradburyRpc")
    ]);

    const allOk = Object.values(checks).every((check) => check.ok);
    return reply.code(allOk ? 200 : 503).send({
      status: allOk ? "ok" : "degraded",
      service: config.SERVICE_NAME,
      role: config.SERVICE_ROLE,
      factoryContractAddress: config.FACTORY_CONTRACT_ADDRESS || null,
      checks
    });
  });

  app.post("/auth/signup", async (request, reply) => {
    const body = z.object({
      username: z.string().min(3),
      email: z.string().email(),
      password: z.string().min(8),
      walletAddress: z.string(),
      encryptedPrivateKey: z.string(),
      encryptedPrivateKeyNonce: z.string(),
      vaultSalt: z.string()
    }).parse(request.body) as SignupPayload & { encryptedPrivateKeyNonce: string; vaultSalt: string };

    const passwordHash = await hashPassword(body.password);
    const userId = makeId("usr");
    const paymentId = makeId("pay");

    await query("begin");
    try {
      await query(
        `insert into users (id, username, email, password_hash, wallet_address, encrypted_private_key, encrypted_private_key_nonce, vault_salt, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_payment')`,
        [userId, body.username, body.email, passwordHash, body.walletAddress, body.encryptedPrivateKey, body.encryptedPrivateKeyNonce, body.vaultSalt]
      );
      await query(
        `insert into payment_receipts (id, user_id, network, amount_gen, treasury_address, tx_hash, status)
         values ($1, $2, 'bradbury', 10, $3, $4, 'pending_submission')`,
        [
          paymentId,
          userId,
          process.env.BRADBURY_TREASURY_ADDRESS ?? "0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E",
          `pending_${paymentId}`
        ]
      );
      await query("commit");
    } catch (error) {
      await query("rollback");
      throw error;
    }

    const token = await reply.jwtSign({ sub: userId });
    return {
      token,
      snapshot: await getSnapshot(userId),
      recoveryWarning: "Store your private key backup. The backend only holds your encrypted vault blob."
    };
  });

  app.post("/auth/login", async (request, reply) => {
    const body = z.object({
      username: z.string().min(1),
      password: z.string().min(8)
    }).parse(request.body) as LoginPayload;

    const user = await getUserByUsername(body.username);
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return reply.code(401).send({ error: "Invalid credentials." });
    }
    const token = await reply.jwtSign({ sub: user.id });
    return {
      token,
      snapshot: await getSnapshot(user.id),
      vault: {
        encryptedPrivateKey: user.encrypted_private_key,
        encryptedPrivateKeyNonce: user.encrypted_private_key_nonce,
        vaultSalt: user.vault_salt,
        walletAddress: user.walletAddress
      }
    };
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => {
    return getSnapshot((request as AuthenticatedRequest).user.sub);
  });

  app.post("/payments/submit", { preHandler: requireAuth }, async (request) => {
    const body = z.object({ txHash: z.string().startsWith("0x") }).parse(request.body);
    return submitPayment((request as AuthenticatedRequest).user.sub, body.txHash);
  });

  app.post("/payments/:id/refresh", { preHandler: requireAuth }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    return refreshPayment(params.id);
  });

  app.post("/agents", { preHandler: requireAuth }, async (request) => {
    const body = z.object({
      name: z.string().min(2),
      archetype: z.enum(["research", "briefing", "goal-coach", "project-tracker", "content-draft"]),
      topic: z.string().min(2),
      objective: z.string().min(8),
      sourceUrls: z.array(z.string().url()).min(1),
      tone: z.enum(["concise", "analytical", "casual"]),
      cadence: z.enum(["daily", "weekly"])
    }).parse(request.body) as CreateAgentPayload;
    return createAgentForUser({
      userId: (request as AuthenticatedRequest).user.sub,
      ...body
    });
  });

  app.get("/agents/current", { preHandler: requireAuth }, async (request) => {
    return getSnapshot((request as AuthenticatedRequest).user.sub);
  });

  app.post("/agents/current/chat", { preHandler: requireAuth }, async (request) => {
    const body = z.object({ message: z.string().min(1) }).parse(request.body);
    return chatWithAgent((request as AuthenticatedRequest).user.sub, body.message);
  });

  app.post("/subagents", { preHandler: requireAuth }, async (request) => {
    const body = z.object({
      name: z.string().min(2),
      archetype: z.enum(["research", "briefing", "goal-coach", "project-tracker", "content-draft"]),
      role: z.string().min(6),
      contractAddress: z.string().startsWith("0x"),
      deploymentTxHash: z.string().startsWith("0x"),
      registerTxHash: z.string().startsWith("0x")
    }).parse(request.body);
    return registerSubagent({
      userId: (request as AuthenticatedRequest).user.sub,
      ...body
    });
  });

  app.post("/delegations", { preHandler: requireAuth }, async (request) => {
    const body = z.object({
      handle: z.string().min(2),
      address: z.string().startsWith("0x"),
      role: z.enum(["viewer", "operator", "admin"])
    }).parse(request.body);
    return grantDelegation((request as AuthenticatedRequest).user.sub, body);
  });

  app.get("/contracts/subagent-code", async () => ({
    code: readContract("contracts/subagent/genfren_subagent.py")
  }));
}
