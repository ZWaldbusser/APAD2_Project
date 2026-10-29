import { useState } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { users } from "../services";
import Swal from "sweetalert2";

function CreateUser() {
  const [userID, setUserID] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate();

  const handleSignup = async () => {
    // Warning alert if passwords don't match
    if (password !== confirmPassword) {
      Swal.fire({
        icon: "warning",
        title: "Passwords don't match",
        text: "Please make sure your passwords match before continuing.",
      });
      return;
    }

    try {
      const response = await users.signup(userID, password);
      const data = await response.json();

      if (response.ok) {
        // Success alert if signup is successful
        await Swal.fire({
          icon: "success",
          title: "Account Created!",
          text: "You can now log in with your new credentials.",
          timer: 1500,
          showConfirmButton: false,
        });
        navigate("/login");
      } else {
        // Error alert if signup fails
        Swal.fire({
          icon: "error",
          title: "Signup Failed",
          text: data.error || "An error occurred during signup. Please try again.",
        });
      }
    } catch {
      // Error alert if server is unreachable
      Swal.fire({
        icon: "error",
        title: "Connection Error",
        text: "Network error. Please check your connection and try again.",
      });
    }
  };

  return (
    <div>
      <main className="login-page">
        <div className="login-box">
          <h1>Register User</h1>

          <label>Username</label>
          <input
            type="text"
            placeholder="Enter username"
            value={userID}
            onChange={(e) => setUserID(e.target.value)}
          />

          <label>Password</label>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label>Confirm Password</label>
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <button onClick={handleSignup}>Create Account</button>
          <button onClick={() => navigate("/")}>Back</button>
        </div>
      </main>
    </div>
  );
}

export default CreateUser;
