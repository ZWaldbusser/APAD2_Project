import { useState } from "react";
import { Link } from "react-router-dom";
import { users } from "../services";
import { useAuthRequest } from "../hooks/useAuthRequest";
import { authResponseError } from "../authFeedback";
import { agencyNames } from "../projectContext";
import AuthFeedback from "../components/AuthFeedback";
import AuthField from "../components/AuthField";

const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,49}$/;
export default function CreateUser() {
  const [agencyCode, setAgencyCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [created, setCreated] = useState(null);
  const form = useAuthRequest();
  const submit = (event) => {
    event.preventDefault();
    const fields = {};
    if (!Object.hasOwn(agencyNames, agencyCode))
      fields["register-agency"] = "Select your agency.";
    if (!USERNAME_PATTERN.test(username.trim()))
      fields["register-username"] =
        "Use 3–50 characters: letters, numbers, periods, underscores or hyphens, starting with a letter or number.";
    if (password.length < 8)
      fields["register-password"] = "Use at least 8 characters.";
    else if (new TextEncoder().encode(password).length > 72)
      fields["register-password"] =
        "Password must be no longer than 72 UTF-8 bytes.";
    if (password !== confirmPassword || !confirmPassword)
      fields["register-confirm"] = "Enter the same password in both fields.";
    if (Object.keys(fields).length) {
      form.setError({ title: "Check your account details", fields });
      return;
    }
    form.run(
      () => users.register(agencyCode, username.trim(), password),
      (response, data) => {
        if (!response.ok) {
          const error = authResponseError(response.status, "Registration");
          if (response.status === 400 && Array.isArray(data?.errors))
            error.message =
              data.errors
                .filter((value) => typeof value === "string")
                .join(" ") || error.message;
          form.setError(error);
          return;
        }
        if (
          typeof data?.user?.username !== "string" ||
          !data.user.username.trim()
        ) {
          form.setError({
            title: "Registration result unavailable",
            message:
              "Your account may have been created. Try logging in before submitting another registration.",
          });
          return;
        }
        setPassword("");
        setConfirmPassword("");
        setCreated(data.user.username);
      },
    );
  };
  if (created)
    return (
      <section className="auth-card">
        <p className="auth-eyebrow">ACCOUNT CREATED</p>
        <h1>You’re ready to log in</h1>
        <p role="status">
          Log in as <strong>{created}</strong> to set up two-factor
          authentication.
        </p>
        <Link className="auth-button" to="/login">
          Continue to login
        </Link>
      </section>
    );
  return (
    <section className="auth-card">
      <p className="auth-eyebrow">YOUR AGENCY ACCOUNT</p>
      <h1>Create account</h1>
      <p className="auth-intro">
        Choose your agency and account details. You’ll set up your authenticator
        after logging in.
      </p>
      <AuthFeedback error={form.error} />
      <form
        onSubmit={submit}
        noValidate
        aria-label="Create account"
        aria-busy={form.busy}
      >
        <div className="auth-field">
          <div className="auth-label">
            <label htmlFor="register-agency">Agency</label>
            <span className="auth-required" aria-hidden="true">
              *
            </span>
          </div>
          <select
            id="register-agency"
            name="agencyCode"
            required
            value={agencyCode}
            disabled={form.busy}
            onChange={(event) => setAgencyCode(event.target.value)}
            aria-invalid={Boolean(form.error?.fields?.["register-agency"])}
            aria-describedby={
              form.error?.fields?.["register-agency"]
                ? "register-agency-error"
                : "register-agency-hint"
            }
          >
            <option value="">Select your agency</option>
            {Object.entries(agencyNames).map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </select>
          <p className="auth-hint" id="register-agency-hint">
            Your agency stays fixed on your account after registration.
          </p>
          {form.error?.fields?.["register-agency"] && (
            <p className="auth-field-error" id="register-agency-error">
              {form.error.fields["register-agency"]}
            </p>
          )}
        </div>
        <AuthField
          id="register-username"
          name="username"
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Enter username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={form.busy}
          hint="3–50 characters. Use letters, numbers, periods, underscores or hyphens."
          problem={form.error?.fields?.["register-username"]}
        />
        <AuthField
          id="register-password"
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={form.busy}
          hint="At least 8 characters; no more than 72 UTF-8 bytes."
          problem={form.error?.fields?.["register-password"]}
        />
        <AuthField
          id="register-confirm"
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={form.busy}
          problem={form.error?.fields?.["register-confirm"]}
        />
        <button className="auth-button" type="submit" disabled={form.busy}>
          {form.busy ? "Creating account…" : "Create account"}
        </button>
        {form.busy && <p role="status">Creating your account…</p>}
      </form>
      <p className="auth-footer-link">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </section>
  );
}
