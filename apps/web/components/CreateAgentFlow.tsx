"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { createAgent, submitPayment } from "../lib/api";
import { sendCreationPayment } from "../lib/vault";

export function CreateAgentFlow() {
  const router = useRouter();
  const [paymentHash, setPaymentHash] = useState("");
  const [error, setError] = useState("");
  const [pendingPay, setPendingPay] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingPay(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const txHash = await sendCreationPayment(String(form.get("paymentPassword") ?? ""));
      setPaymentHash(txHash);
      await submitPayment(txHash);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment failed.");
    } finally {
      setPendingPay(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingCreate(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
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
          Use the local vault to approve the one-time activation. Once it clears, your companion can be created and kept private to you.
        </p>
        <form className="form-grid" style={{ marginTop: 16 }} onSubmit={pay}>
          <input name="paymentPassword" placeholder="Vault password" type="password" required />
          <button className="button primary" type="submit" disabled={pendingPay}>
            {pendingPay ? "Approving activation..." : "Approve activation"}
          </button>
        </form>
        {paymentHash ? <div className="muted" style={{ marginTop: 12 }}>Activation submitted. GenFren is waiting for confirmation.</div> : null}
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
          {error ? <div className="error-text">{error}</div> : null}
          <button className="button primary" type="submit" disabled={pendingCreate}>
            {pendingCreate ? "Creating your companion..." : "Create GenFren"}
          </button>
        </form>
      </section>
    </div>
  );
}
