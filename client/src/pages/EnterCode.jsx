import { useEffect, useState } from "react";
import "../styles/Login.css";
import "../styles/TwoFactor.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { users } from "../services";
import Swal from "sweetalert2";

function EnterCode() {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  // Only reachable right after a successful password login
  useEffect(() => {
    if (!sessionStorage.getItem("mfaToken")) navigate("/login");
  }, [navigate]);

  const handleVerify = async () => {
    if (submitting) return; // avoid repeat submissions (counts against the rate limit)

    if (!/^\d{6}$/.test(code)) {
      Swal.fire({
        icon: "error",
        title: "Invalid Code",
        text: "Enter the 6-digit code from your authenticator app.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await users.verify2fa(sessionStorage.getItem("mfaToken"), code);
      // Don't crash if the server returns a non-JSON error page
      const data = await res.json().catch(() => ({}));

      if (res.status === 400) {
        // 2FA isn't set up yet for this account
        navigate("/2fa/setup");
        return;
      }

      if (res.status === 429) {
        // Too many attempts
        Swal.fire({
          icon: "error",
          title: "Too Many Attempts",
          text: "Please wait a few minutes and try again.",
        });
        return;
      }

      if (!res.ok) {
        // 401: wrong/reused code, or the 5-minute login session expired
        Swal.fire({
          icon: "error",
          title: "Code Not Accepted",
          text: "Wait for a new code in your app and try again. If it still fails, your session may have expired. Go back and log in again.",
        });
        setCode("");
        return;
      }

      // Fully signed in
      sessionStorage.removeItem("mfaToken");
      login(data.accessToken);

      // Success alert if the code is valid
      await Swal.fire({
        icon: "success",
        title: "Welcome!",
        text: "Successful log in.",
        timer: 1500,
        showConfirmButton: false,
      });

      navigate("/visualization");
    } catch {
      // Error alert if server is unreachable
      Swal.fire({
        icon: "error",
        title: "Connection Error",
        text: "Could not reach server. Please try again later.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <main className="login-page">
        <div className="login-box">
          <h1>Enter Code</h1>
          <p className="twofactor-text">
            Open your authenticator app and enter the 6-digit code for this account.
          </p>

          <label>Authentication Code</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Enter 6-digit code"
            value={code}
            // Keep only digits, max 6 (stays a string so leading zeros are kept)
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
          />

          <button onClick={handleVerify} disabled={submitting}>
            {submitting ? "Verifying..." : "Verify"}
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem("mfaToken");
              navigate("/login");
            }}
          >
            Back
          </button>
        </div>
      </main>
    </div>
  );
}

export default EnterCode;