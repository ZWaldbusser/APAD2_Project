import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/LandingPage.css";

export default function AuthEntryPage() {
  const navigate = useNavigate();

  return (
    <div>
      <main className="landing-page">
        <h1>Welcome to the HaaS Hub!</h1>

        <div className="nav-box">
          <button onClick={() => navigate("/register")}>Create Account</button>
          <button onClick={() => navigate("/login")}>Log In</button>
          
        </div>
      </main>
    </div>
  );
}