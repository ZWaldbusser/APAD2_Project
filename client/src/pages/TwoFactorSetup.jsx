import { useEffect, useRef, useState } from "react";
import "../styles/Login.css";
import "../styles/TwoFactor.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { users } from "../services";
import Swal from "sweetalert2";

function TwoFactorSetup() {
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [code, setCode] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();
  const requested = useRef(false);

  // Send the user back to login with a message (expired session, steps out of order, etc.)
  const backToLogin = async (text) => {
    sessionStorage.removeItem("mfaToken");
    await Swal.fire({ icon: "warning", title: "Session Expired", text });
    navigate("/login");
  };

  // Load the QR code when the page opens
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    const mfaToken = sessionStorage.getItem("mfaToken");
    if (!mfaToken) {
      navigate("/login");
      return;
    }

    const loadQrCode = async () => {
      try {
        const res = await users.setup2fa(mfaToken);
        const data = await res.json();

        if (res.status === 409) {
          // 2FA is already on for this account, so they should enter a code instead
          navigate("/2fa/verify");
          return;
        }
        if (!res.ok) {
          backToLogin("Please log in again to set up two-factor authentication.");
          return;
        }

        setQrCode(data.qrCodeDataUrl);
        setSecret(data.secret);
      } catch {
        // Error alert if server is unreachable
        Swal.fire({
          icon: "error",
          title: "Connection Error",
          text: "Could not reach server. Please try again later.",
        });
      }
    };

    loadQrCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnable = async () => {
    if (!/^\d{6}$/.test(code)) {
      Swal.fire({
        icon: "error",
        title: "Invalid Code",
        text: "Enter the 6-digit code from your authenticator app.",
      });
      return;
    }

    try {
      const res = await users.enable2fa(sessionStorage.getItem("mfaToken"), code);
      const data = await res.json();

      if (res.status === 400) {
        backToLogin("Please log in again to set up two-factor authentication.");
        return;
      }
      if (res.status === 429) {
        Swal.fire({
          icon: "error",
          title: "Too Many Attempts",
          text: "Please wait a minute and try again.",
        });
        return;
      }
      if (!res.ok) {
        // Error alert if the code is wrong or already used
        Swal.fire({
          icon: "error",
          title: "Code Not Accepted",
          text: "Wait for a new code in your app and try again. If this keeps happening, go back and log in again.",
        });
        setCode("");
        return;
      }

      sessionStorage.removeItem("mfaToken");
      login(data.accessToken);

      // Success alert once 2FA is turned on
      await Swal.fire({
        icon: "success",
        title: "Two-Factor Enabled!",
        text: "Your account is now protected.",
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
    }
  };

  return (
    <div>
      <main className="login-page">
        <div className="login-box">
          <h1>Set Up Two-Factor</h1>
          <p className="twofactor-text">
            Scan this QR code with Google Authenticator, then enter the 6-digit code it shows.
          </p>

          <div className="qr-code">
            {qrCode ? (
              <img src={qrCode} alt="QR code for your authenticator app" />
            ) : (
              <p>Loading QR code...</p>
            )}
          </div>

          {secret && (
            <button onClick={() => setShowSecret(!showSecret)}>
              {showSecret ? "Hide Setup Key" : "Can't Scan? Show Setup Key"}
            </button>
          )}
          {showSecret && <code className="setup-key">{secret}</code>}

          <label>Authentication Code</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Enter 6-digit code"
            value={code}
            // Keep only digits, max 6 (stays a string so leading zeros are kept)
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />

          <button onClick={handleEnable}>Enable Two-Factor</button>
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

export default TwoFactorSetup;