"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { signup } from "../lib/api";
import { createVault } from "../lib/vault";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    try {
      const vault = await createVault(password);
      await signup({
        username,
        email,
        password,
        ...vault
      });
      router.push("/create-agent");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Signup failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-grid" style={{ marginTop: 24 }} onSubmit={onSubmit}>
      <input name="username" placeholder="Username" required />
      <input name="email" placeholder="Email" type="email" required />
      <input name="password" placeholder="Password" type="password" required minLength={8} />
      <div className="panel surface">
        <strong>Keep your login details safe</strong>
        <div className="muted" style={{ marginTop: 8 }}>
          This workspace is designed to stay private to you. If you lose both your password and your saved recovery material, access cannot be restored.
        </div>
      </div>
      {error ? <div className="error-text">{error}</div> : null}
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? "Creating your start..." : "Continue"}
      </button>
    </form>
  );
}
