import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { users } from "../services";
import { useAuth } from "../context/AuthContext";
import { useAuthRequest } from "../hooks/useAuthRequest";
import { authResponseError, hasToken } from "../authFeedback";
import AuthFeedback from "../components/AuthFeedback";
import AuthField from "../components/AuthField";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const location = useLocation(),
    navigate = useNavigate();
  const { logout } = useAuth();
  const form = useAuthRequest();
  const [sessionNotice] = useState(() => sessionStorage.getItem("authNotice"));
  useEffect(() => {
    sessionStorage.removeItem("authNotice");
  }, []);
  const submit = (event) => {
    event.preventDefault();
    const fields = {};
    if (!username.trim()) fields["login-username"] = "Enter your username.";
    if (!password) fields["login-password"] = "Enter your password.";
    if (Object.keys(fields).length) {
      form.setError({ title: "Check your login details", fields });
      return;
    }
    form.run(
      () => users.login(username.trim(), password),
      (response, data) => {
        if (!response.ok) {
          form.setError(authResponseError(response.status, "Login"));
          return;
        }
        if (
          !hasToken(data?.mfaToken) ||
          !["2fa_setup", "2fa_verify"].includes(data.nextStep)
        ) {
          sessionStorage.removeItem("mfaToken");
          form.setError({
            title: "Unexpected login response",
            message:
              "We could not start verification. Please try logging in again.",
          });
          return;
        }
        logout();
        sessionStorage.removeItem("authNotice");
        sessionStorage.setItem("mfaToken", data.mfaToken);
        navigate(data.nextStep === "2fa_setup" ? "/2fa/setup" : "/2fa/verify");
      },
    );
  };
  return (
    <section className="auth-card">
      <p className="auth-eyebrow">YOUR AGENCY ACCOUNT</p>
      <h1>Log in</h1>
      <p className="auth-intro">
        Enter your account details, then verify with your authenticator app.
      </p>
      {sessionNotice === "session-ended" && (
        <p role="status" className="auth-notice">
          Your session is no longer valid. Please log in again to continue.
        </p>
      )}
      {(sessionNotice === "signed-out" ||
        location.state?.notice === "signed-out") && (
        <p role="status" className="auth-notice">
          You’re signed out on this device.
        </p>
      )}
      {location.state?.notice === "mfa-ended" && (
        <p role="status" className="auth-notice">
          Your verification session ended. Please log in again.
        </p>
      )}
      <AuthFeedback error={form.error} />
      <form
        onSubmit={submit}
        noValidate
        aria-label="Log in"
        aria-busy={form.busy}
      >
        <AuthField
          id="login-username"
          name="username"
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Enter username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={form.busy}
          problem={form.error?.fields?.["login-username"]}
        />
        <AuthField
          id="login-password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={form.busy}
          problem={form.error?.fields?.["login-password"]}
        />
        <button className="auth-button" type="submit" disabled={form.busy}>
          {form.busy ? "Logging in…" : "Log in"}
        </button>
        {form.busy && <p role="status">Checking your account…</p>}
      </form>
      <div className="auth-links">
        <Link to="/forgotpassword">Forgot Password?</Link>
        <Link to="/register">Create account</Link>
      </div>
    </section>
  );
}
