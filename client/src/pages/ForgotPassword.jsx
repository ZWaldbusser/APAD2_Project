import { Link } from "react-router-dom";
export default function ForgotPassword() {
  return (
    <section className="auth-card">
      <p className="auth-eyebrow">ACCOUNT HELP</p>
      <h1>Password recovery is not available</h1>
      <p className="auth-intro">
        Password recovery is not connected for this app yet. Your password has
        not been changed.
      </p>
      <p>
        Ask your team or account administrator about the recovery options for
        your agency account.
      </p>
      <Link className="auth-button secondary" to="/login">
        Back to login
      </Link>
    </section>
  );
}
