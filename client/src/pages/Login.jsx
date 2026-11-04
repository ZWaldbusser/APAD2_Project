import { useState } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { users } from "../services";
import Swal from "sweetalert2";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async () => {
    try {
      const res = await users.login(username, password);
      const data = await res.json();

      if (!res.ok) {
        // Error alert if credentials fail
        Swal.fire({
          icon: "error",
          title: "Login Failed",
          text: "Please check your credentials and try again.",
        });
        return;
      }

      login(data.token);

        // Success alert if credentials are valid
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