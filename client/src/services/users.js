// Users / Auth service client.
// Routes are the same as the monolith now. When the real service contract
// is known, change the paths and bodies here only.

import { request } from "./http";

export const signup = (userID, password) =>
  request("users", "/api/signup", {
    method: "POST",
    body: { userID, password },
    auth: false,
  });

export const login = (userid, password) =>
  request("users", "/api/login", {
    method: "POST",
    body: { userid, password },
    auth: false,
  });

export const forgotPassword = (userID, password, confirmPassword) =>
  request("users", "/api/forgot_password", {
    method: "POST",
    body: { userID, password, confirmPassword },
    auth: false,
  });

export const me = () => request("users", "/api/me");

export const listUsers = () => request("users", "/api/users");

/** Returns the authenticated MongoDB user, or null when the session is unavailable. */
export async function getCurrentUser() {
  try {
    const res = await me();
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
