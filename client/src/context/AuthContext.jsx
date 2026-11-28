import { useState } from "react";
import { clearFreshness } from "../services/freshness";
import { AuthContext } from "./useAuth";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("token"));

  const login = (newToken) => {
    clearFreshness();
    localStorage.setItem("token", newToken);
    setToken(newToken);
  };

  const logout = () => {
    clearFreshness();
    localStorage.removeItem("token");
    sessionStorage.removeItem("mfaToken");
    sessionStorage.setItem("authNotice", "signed-out");
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{ token, login, logout, isAuthenticated: !!token }}
    >
      {children}
    </AuthContext.Provider>
  );
}
