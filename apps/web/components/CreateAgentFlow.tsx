"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { createAgent, submitPayment } from "../lib/api";
import { loadVault, sendCreationPayment } from "../lib/vault";

const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_BRADBURY_TREASURY_ADDRESS ?? "0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E";
const BRADBURY_RPC = process.env.NEXT_PUBLIC_BRADBURY_RPC_URL ?? "https://rpc-bradbury.genlayer.com";

export function CreateAgentFlow() {
  const router = useRouter();
  const [paymentHash, setPaymentHash] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [vaultAddress, setVaultAddress] = useState("");
  const [pendingPay, setPendingPay] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);

  useEffect(() => {
    setVaultAddress(loadVault()?.walletAddress ?? "");
  }, []);

  async function approveFromVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingPay(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const txHash = await sendCreationPayment(String(form.get("paymentPassword") ?? ""));
      setPaymentHash(txHash);
      await submitPayment(txHash);
      setNotice("Activation transaction submitted. You can create your companion once verification completes.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment failed.");
    } finally {
      setPendingPay(false);
    }
  }

  async function submitManualPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingPay(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const txHash = String(form.get("txHash") ?? "").trim();
    try {
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        throw new Error("Paste a valid Bradbury transaction hash. It should start with 0x and be 66 characters long.");
      }
      setPaymentHash(txHash);
      await submitPayment(txHash);
      setNotice("Payment hash submitted. GenFren will verify the sender, treasury address, amount, and confirmation state.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment submission failed.");
    } finally {
      setPendingPay(false);
    }
  }

  async function copyTreasury() {
    await navigator.clipboard.writeText(TREASURY_ADDRESS);
    setNotice("Treasury address copied.");
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingCreate(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (!paymentHash) {
        throw new Error("Activate GenFren first by sending 10 GEN to the treasury and submitting the transaction hash.");
      }
      await createAgent({
        name: String(form.get("name") ?? ""),
        archetype: String(form.get("archetype") ?? "research") as any,
        topic: String(form.get("topic") ?? ""),
        objective: String(form.get("objective") ?? ""),
        sourceUrls: String(form.get("sourceUrls") ?? "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        tone: String(form.get("tone") ?? "analytical") as any,
        cadence: String(form.get("cadence") ?? "daily") as any
      });
      router.push("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Agent creation failed.");
    } finally {
      setPendingCreate(false);
    }
  }

  return (
    <div className="cards-2">
      <section className="panel surface">
        <div className="pill">Unlock your companion</div>
        <h1 style={{ marginBottom: 10 }}>Activate GenFren</h1>
        <p className="muted">
          Send a one-time 10 GEN activation payment on Bradbury, then submit the transaction hash so GenFren can verify it.
        </p>

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="eyebrow">Payment details</div>
          <div className="payment-detail">
            <span>Amount</span>
            <strong>10 GEN</strong>
          </div>
          <div className="payment-detail">
            <span>Network</span>
            <strong>Bradbury</strong>
          </div>
          <div className="payment-detail address-row">
            <span>Treasury</span>
            <code>{TREASURY_ADDRESS}</code>
          </div>
          <div className="cta-row" style={{ marginTop: 14 }}>
            <button className="button secondary" type="button" onClick={copyTreasury}>Copy treasury</button>
            <a className="button ghost" href={BRADBURY_RPC} target="_blank" rel="noreferrer">Bradbury RPC</a>
          </div>
          {vaultAddress ? (
            <p className="muted" style={{ marginTop: 12 }}>
              Your local vault address is <code>{vaultAddress}</code>. Fund it first if you want GenFren to send the activation payment for you.
            </p>
          ) : null}
        </div>

        <form className="form-grid" style={{ marginTop: 16 }} onSubmit={submitManualPayment}>
          <input name="txHash" placeholder="Paste Bradbury payment transaction hash" required />
          <button className="button primary" type="submit" disabled={pendingPay}>
            {pendingPay ? "Submitting hash..." : "Submit payment hash"}
          </button>
        </form>

        <div className="divider-label">or approve from a funded local vault</div>

        <form className="form-grid" style={{ marginTop: 16 }} onSubmit={approveFromVault}>
          <input name="paymentPassword" placeholder="Vault password" type="password" required />
          <button className="button secondary" type="submit" disabled={pendingPay}>
            {pendingPay ? "Approving activation..." : "Approve activation"}
          </button>
        </form>
        {paymentHash ? <div className="muted" style={{ marginTop: 12 }}>Activation submitted: <code>{paymentHash}</code></div> : null}
        {notice ? <div className="success-text">{notice}</div> : null}
        {error ? <div className="error-text">{error}</div> : null}
      </section>

      <section className="panel surface">
        <div className="pill">Shape the first mission</div>
        <h2 style={{ marginBottom: 10 }}>Tell GenFren how to help</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Pick one concrete focus. GenFren works best when the first mission is narrow, useful, and easy to keep returning to.
        </p>
        <form className="form-grid" onSubmit={create}>
          <input name="name" placeholder="Companion name" required />
          <select name="archetype" defaultValue="research">
            <option value="research">Research companion</option>
            <option value="briefing">Briefing companion</option>
            <option value="goal-coach">Goal coach</option>
            <option value="project-tracker">Project tracker</option>
            <option value="content-draft">Writing partner</option>
          </select>
          <input name="topic" placeholder="Main focus" required />
          <textarea name="objective" placeholder="What should GenFren stay on top of for you?" rows={4} required />
          <textarea name="sourceUrls" placeholder="Useful links to follow, one per line" rows={5} required />
          <div className="cards-2">
            <select name="tone" defaultValue="analytical">
              <option value="analytical">Analytical</option>
              <option value="concise">Concise</option>
              <option value="casual">Casual</option>
            </select>
            <select name="cadence" defaultValue="daily">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <button className="button primary" type="submit" disabled={pendingCreate}>
            {pendingCreate ? "Creating your companion..." : "Create GenFren"}
          </button>
        </form>
      </section>
    </div>
  );
}
