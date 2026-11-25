import { Link } from "react-router-dom";
import "../styles/Login.css";

export default function ForgotPassword() {
  return (
    <main className="login-page">
      <div className="login-box">
        <h1>Account recovery</h1>
        <p>
          Password recovery is currently unavailable. Contact your agency
          administrator for help accessing your account.
        </p>
        <Link to="/login">Back to sign in</Link>
      </div>
    </main>
  );
}
