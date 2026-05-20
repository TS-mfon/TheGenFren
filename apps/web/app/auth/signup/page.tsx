import { SignupForm } from "../../../components/SignupForm";

export default function SignupPage() {
  return (
    <main className="shell hero">
      <div className="auth-card panel" style={{ maxWidth: 720, margin: "0 auto" }}>
        <div className="eyebrow">Create your private start</div>
        <h1>Create your GenFren</h1>
        <p className="muted auth-copy">
          Start with a private local vault, then shape the first companion that follows your goals and returns with useful context.
        </p>
        <SignupForm />
      </div>
    </main>
  );
}
