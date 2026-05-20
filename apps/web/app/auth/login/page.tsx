import { LoginForm } from "../../../components/LoginForm";

export default function LoginPage() {
  return (
    <main className="shell hero">
      <div className="auth-card panel" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="eyebrow">Welcome back</div>
        <h1>Return to your agent</h1>
        <p className="muted auth-copy">Pick up the thread, review what changed, and keep moving without rebuilding context.</p>
        <LoginForm />
      </div>
    </main>
  );
}
