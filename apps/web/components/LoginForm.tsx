"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { login } from "../lib/api";
import { saveVault } from "../lib/vault";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const result = await login({
        username: String(form.get("username") ?? ""),
        password: String(form.get("password") ?? "")
      });
      if (result.vault?.encryptedPrivateKey && result.vault?.encryptedPrivateKeyNonce && result.vault?.vaultSalt) {
        saveVault(result.vault as any);
      }
      router.push("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-grid" style={{ marginTop: 20 }} onSubmit={onSubmit}>
      <input name="username" placeholder="Username" required />
      <input name="password" placeholder="Password" type="password" required />
      {error ? <div className="error-text">{error}</div> : null}
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? "Unlocking..." : "Unlock vault"}
      </button>
    </form>
  );
}
