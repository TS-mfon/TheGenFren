import { makeId } from "../lib/ids.js";
import { query } from "../lib/db.js";
import { paymentQueue } from "../lib/redis.js";
import { verifyBradburyTransfer } from "./genlayer.js";
import { getCurrentPayment, getUserById } from "./snapshot.js";
import { getCurrentAgent } from "./snapshot.js";
import { writeAuditLog } from "./agent.js";

export async function submitPayment(userId: string, txHash: string) {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found.");
  }

  const existing = await getCurrentPayment(userId);
  const id = existing?.id ?? makeId("pay");
  await query(
    `update payment_receipts
     set tx_hash = $2, status = 'submitted', rejection_reason = ''
     where id = $1`,
    [id, txHash]
  );
  const agent = await getCurrentAgent(userId);
  await writeAuditLog({
    actorType: "user",
    actorId: userId,
    agentId: agent?.id ?? null,
    action: "payment.submitted",
    payload: {
      txHash,
      network: "bradbury"
    }
  });
  await paymentQueue.add("verify-payment", { paymentId: id }, { jobId: id });
  return refreshPayment(id);
}

export async function refreshPayment(paymentId: string) {
  const paymentResult = await query<{
    id: string;
    userId: string;
    txHash: string;
  }>(`select id, user_id as "userId", tx_hash as "txHash" from payment_receipts where id = $1`, [paymentId]);
  const payment = paymentResult.rows[0];
  if (!payment) {
    throw new Error("Payment not found.");
  }
  const user = await getUserById(payment.userId);
  if (!user) {
    throw new Error("User not found.");
  }
  const verification = await verifyBradburyTransfer(payment.txHash, user.walletAddress);
  const status = verification.confirmed ? "confirmed" : "rejected";

  await query(
    `update payment_receipts
     set status = $2,
         sender_address = $3,
         confirmed_at = case when $2 = 'confirmed' then now() else confirmed_at end,
         rejection_reason = $4
     where id = $1`,
    [paymentId, status, verification.senderAddress, verification.rejectionReason]
  );

  if (verification.confirmed) {
    await query(`update users set status = 'active' where id = $1`, [user.id]);
  }
  const agent = await getCurrentAgent(user.id);
  await writeAuditLog({
    actorType: "system",
    actorId: user.id,
    agentId: agent?.id ?? null,
    action: verification.confirmed ? "payment.confirmed" : "payment.rejected",
    payload: {
      txHash: payment.txHash,
      senderAddress: verification.senderAddress,
      rejectionReason: verification.rejectionReason
    }
  });
  return getCurrentPayment(user.id);
}
