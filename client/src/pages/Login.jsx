import { useState } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { users } from "../services";
import Swal from "sweetalert2";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const res = await users.login(username, password);
      // Don't crash if the server returns a non-JSON error page
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        // Too many failed attempts
        Swal.fire({
          icon: "error",
          title: "Too Many Attempts",
          text: "Please wait a minute and try again.",
        });
        return;
      }

      if (!res.ok) {
        // Error alert if credentials fail
        Swal.fire({
          icon: "error",
          title: "Login Failed",
          text: "Please check your credentials and try again.",
        });
        return;
      }

      // Password is correct, but the user isn't fully signed in until 2FA is done.
      // Save the temporary token the 2FA pages need.
      sessionStorage.setItem("mfaToken", data.mfaToken);

      // First login → set up 2FA; returning user → enter code
      if (data.nextStep === "2fa_setup") {
        navigate("/2fa/setup");
      } else if (data.nextStep === "2fa_verify") {
        navigate("/2fa/verify");
      } else {
      // Response isn't from the user service (or the contract changed)
      sessionStorage.removeItem("mfaToken");
      Swal.fire({
        icon: "error",
        title: "Login Error",
        text: "Unexpected response from the server. Please try again later.",
        });
      }

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
          <h1>Login</h1>
          <label>Username</label>
          <input
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <label>Password</label>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />

          <button onClick={handleLogin}>Login</button>
          <button onClick={() => navigate("/forgotpassword")}>
            Forgot Password?
          </button>
          <button onClick={() => navigate("/")}>Back</button>
        </div>
      </main>
    </div>
  );
}

export default Login;