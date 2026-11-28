import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { users } from "../services";
import { useAuth } from "../context/AuthContext";
import { useAuthRequest } from "../hooks/useAuthRequest";
import { authResponseError, hasToken } from "../authFeedback";
import AuthFeedback from "./AuthFeedback";
import AuthField from "./AuthField";

export default function MfaChallenge({ enroll = false }) {
  const [token] = useState(() => sessionStorage.getItem("mfaToken"));
  const [code, setCode] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [enrollment, setEnrollment] = useState({
    status: enroll ? "loading" : "none",
  });
  const setupRequest = useRef(null);
  const navigate = useNavigate(),
    { login } = useAuth(),
    form = useAuthRequest();
  useEffect(() => {
    if (!enroll || !hasToken(token)) return;
    // Retain a single setup request through StrictMode's effect replay.
    if (setupRequest.current?.attempt !== attempt) {
      setupRequest.current = {
        attempt,
        promise: users
          .setup2fa(token)
          .then(async (response) => ({
            response,
            data: await response.json().catch(() => null),
          })),
      };
    }
    let current = true;
    setupRequest.current.promise.then(
      ({ response, data }) => {
        if (!current) return;
        if (response.status === 409) {
          navigate("/2fa/verify", { replace: true });
          return;
        }
        if (!response.ok) {
          const expired = [400, 401].includes(response.status);
          if (expired) sessionStorage.removeItem("mfaToken");
          setEnrollment({
            status: "error",
            expired,
            problem: expired
              ? {
                  title: "Verification session ended",
                  message:
                    "Please log in again before setting up your authenticator.",
                }
              : authResponseError(response.status, "Setup"),
          });
          return;
        }
        if (
          typeof data?.qrCodeDataUrl !== "string" ||
          !/^data:image\/(png|jpeg|svg\+xml)[;,]/i.test(data.qrCodeDataUrl)
        ) {
          setEnrollment({
            status: "error",
            problem: {
              title: "Setup data unavailable",
              message:
                "We could not display your authenticator QR code. Retry setup or log in again.",
            },
          });
          return;
        }
        setEnrollment({
          status: "ready",
          qrCode: data.qrCodeDataUrl,
          secret: typeof data.secret === "string" ? data.secret : "",
        });
      },
      () => {
        if (current)
          setEnrollment({
            status: "error",
            problem: {
              title: "Setup unavailable",
              message:
                "We could not reach the authentication service. Retry setup when the connection is available.",
            },
          });
      },
    );
    return () => {
      current = false;
    };
  }, [enroll, token, attempt, navigate]);
  const startAgain = () => {
    sessionStorage.removeItem("mfaToken");
    navigate("/login", { state: { notice: "mfa-ended" } });
  };
  const submit = (event) => {
    event.preventDefault();
    if (!hasToken(sessionStorage.getItem("mfaToken"))) {
      startAgain();
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      form.setError({
        title: "Check your verification code",
        fields: {
          "mfa-code": "Enter the six-digit code from your authenticator app.",
        },
      });
      return;
    }
    if (enroll && enrollment.status !== "ready") return;
    form.run(
      () =>
        enroll ? users.enable2fa(token, code) : users.verify2fa(token, code),
      (response, data) => {
        if (response.status === 400) {
          if (enroll) startAgain();
          else navigate("/2fa/setup", { replace: true });
          return;
        }
        if (!response.ok) {
          form.setError(authResponseError(response.status, "Verification"));
          if ([401, 403, 409].includes(response.status)) setCode("");
          return;
        }
        if (!hasToken(data?.accessToken)) {
          form.setError({
            title: "Verification result unavailable",
            message:
              "We could not confirm your login. Go back and log in again before another attempt.",
          });
          return;
        }
        sessionStorage.removeItem("mfaToken");
        login(data.accessToken);
        navigate("/integration");
      },
    );
  };
  if (!hasToken(token))
    return <Navigate to="/login" state={{ notice: "mfa-ended" }} replace />;
  return (
    <section className="auth-card">
      <p className="auth-eyebrow">VERIFY YOUR ACCOUNT</p>
      <h1>{enroll ? "Set Up Two-Factor" : "Enter Code"}</h1>
      <p className="auth-intro">
        {enroll
          ? "Scan the QR code with your authenticator app, then enter the six-digit code it shows."
          : "Enter the six-digit code for this account from your authenticator app."}
      </p>
      <AuthFeedback error={form.error || enrollment.problem} />
      {enroll &&
        (enrollment.status === "loading" ? (
          <p className="auth-loading" role="status">
            Loading your authenticator setup…
          </p>
        ) : enrollment.status === "error" ? (
          !enrollment.expired && (
            <button
              className="auth-button secondary"
              onClick={() => {
                form.setError(null);
                setShowSecret(false);
                setEnrollment({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              Retry setup
            </button>
          )
        ) : (
          <div className="auth-enrollment">
            <img
              className="auth-qr"
              src={enrollment.qrCode}
              width="224"
              height="224"
              alt="QR code for your authenticator app"
            />
            {enrollment.secret && (
              <>
                <button
                  className="auth-text-button"
                  type="button"
                  aria-expanded={showSecret}
                  aria-controls="setup-key"
                  onClick={() => setShowSecret((value) => !value)}
                >
                  {showSecret ? "Hide Setup Key" : "Can’t scan? Show Setup Key"}
                </button>
                {showSecret && (
                  <div id="setup-key" className="auth-setup-key">
                    <p>Enter this key in your authenticator app.</p>
                    <code>{enrollment.secret}</code>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      {(!enroll || enrollment.status === "ready") && (
        <form
          onSubmit={submit}
          noValidate
          aria-label={enroll ? "Enable two-factor" : "Verify code"}
          aria-busy={form.busy}
        >
          <AuthField
            id="mfa-code"
            name="code"
            label="Authentication Code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Enter 6-digit code"
            maxLength={6}
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            disabled={form.busy}
            hint="Paste is supported. Codes can start with zero."
            problem={form.error?.fields?.["mfa-code"]}
          />
          <button className="auth-button" type="submit" disabled={form.busy}>
            {form.busy ? "Verifying…" : enroll ? "Enable Two-Factor" : "Verify"}
          </button>
          {form.busy && <p role="status">Verifying your code…</p>}
        </form>
      )}
      <button
        className="auth-text-button"
        type="button"
        disabled={form.busy}
        onClick={startAgain}
      >
        Back to login
      </button>
    </section>
  );
}
