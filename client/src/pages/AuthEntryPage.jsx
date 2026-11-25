import { Link } from "react-router-dom";
export default function AuthEntryPage() {
  return (
    <section className="auth-card">
      <p className="auth-eyebrow">WELCOME TO HAAS HUB</p>
      <h1>Access your agency workspace</h1>
      <p className="auth-intro">
        Log in to manage your projects and shared equipment, or create an agency
        account to get started.
      </p>
      <div className="auth-choice">
        <Link className="auth-button" to="/login">
          Log in
        </Link>
        <Link className="auth-button secondary" to="/register">
          Create account
        </Link>
      </div>
    </section>
  );
}
