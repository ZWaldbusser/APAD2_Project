import { useState } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { users } from "../services";

function ForgotPassword() {
  const [userID, setUserID] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async () => {
  
    // Warning alert if passwords don't match
    if (password !== confirmPassword) {
      Swal.fire({
        icon: "warning",
        title: "Passwords don't match",
        text: "Please make sure your new passwords match before continuing.",
      });
      return;
    }

    try {

      const response = await users.forgotPassword(userID, password, confirmPassword);
      
      const data = await response.json();

      if (response.ok) {
        // Success alert if reset is successful
        await Swal.fire({
          icon: "success",
          title: "Password Reset",
          text: "Your password has been updated successfully.",
          timer: 1500,
          showConfirmButton: false,
        });
        navigate("/login");

      } else {
        // Error alert if reset fails
        Swal.fire({
          icon: "error",
          title: "Reset Failed",
          text: data.error || "Could not reset password. Please try again.",
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
          <h1>Forgot Password</h1>

          <label>Username</label>
          <input
            type="text"
            placeholder="Enter username"
            value={userID}
            onChange={(e) => setUserID(e.target.value)}
          />

          <label>New Password</label>
          <input
            type="password"
            placeholder="Enter new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label>Confirm New Password</label>
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <button onClick={handleSubmit}>Reset Password</button>
          <button onClick={() => navigate("/")}>Back</button>
        </div>
      </main>
    </div>
  );
}

export default ForgotPassword;