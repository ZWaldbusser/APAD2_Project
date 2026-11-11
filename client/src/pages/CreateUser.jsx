import { useState } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { users } from "../services";
import Swal from "sweetalert2";

const AGENCIES = [
  { code: "AUS", name: "Austin" },
  { code: "DAL", name: "Dallas" },
  { code: "TEX", name: "Texas" },
];

const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,49}$/;

// Escape text before putting it in Swal's html (server messages are shown as a list)
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function CreateUser() {
  const [agencyCode, setAgencyCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // Returns a list of problems; empty means the form is valid
  const validate = () => {
    const problems = [];
    if (!agencyCode) problems.push("Select your agency.");
    if (!USERNAME_PATTERN.test(username.trim())) {
      problems.push(
        "Username must be 3–50 characters, start with a letter or number, and use only letters, numbers, periods, underscores, or hyphens."
      );
    }
    if (password.length < 8) problems.push("Password must be at least 8 characters.");
    if (new TextEncoder().encode(password).length > 72) problems.push("Password is too long.");
    if (password !== confirmPassword) problems.push("Passwords don't match.");
    return problems;
  };

  const showProblems = (title, problems) =>
    Swal.fire({
      icon: "warning",
      title,
      html: `<ul style="text-align:left">${problems.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`,
    });

  const handleSignup = async () => {
    if (submitting) return;

    const problems = validate();
    if (problems.length) {
      showProblems("Please fix the following", problems);
      return;
    }

    setSubmitting(true);
    try {
      const response = await users.register(agencyCode, username.trim(), password);
      // Don't crash if the server returns a non-JSON error page
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        // The service stores usernames in lowercase, so show the one to log in with
        await Swal.fire({
          icon: "success",
          title: "Account Created!",
          text: `Log in as "${data.user?.username ?? username.trim().toLowerCase()}" to set up two-factor authentication.`,
        });
        navigate("/login");
        return;
      }

      if (response.status === 400 && Array.isArray(data.errors) && data.errors.length) {
        // Validation errors from the service
        showProblems("Signup Failed", data.errors);
      } else if (response.status === 409) {
        Swal.fire({
          icon: "error",
          title: "Username Taken",
          text: "That username already exists. Please choose another.",
        });
      } else if (response.status === 429) {
        Swal.fire({
          icon: "error",
          title: "Too Many Attempts",
          text: "Please wait a few minutes and try again.",
        });
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <main className="login-page">
        <div className="login-box">
          <h1>Register User</h1>

          <label>Agency</label>
          <select value={agencyCode} onChange={(e) => setAgencyCode(e.target.value)}>
            <option value="" disabled>
              Select your agency
            </option>
            {AGENCIES.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>

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
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label>Confirm Password</label>
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSignup()}
          />

          <button onClick={handleSignup} disabled={submitting}>
            {submitting ? "Creating Account..." : "Create Account"}
          </button>
          <button onClick={() => navigate("/")}>Back</button>
        </div>
      </main>
    </div>
  );
}

export default CreateUser;