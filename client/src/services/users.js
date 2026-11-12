// Users / Auth service client (Users Service API Contract v1.0).

import { request } from "./http";

// 2FA endpoints use the temporary mfaToken; auth: false so a wrong code doesn't redirect to /login.
const withMfaToken = (mfaToken) => ({
  auth: false,
  headers: { Authorization: `Bearer ${mfaToken}` },
});

export const register = (agencyCode, username, password) =>
  request("users", "/users/register", {
    method: "POST",
    body: { agencyCode, username, password },
    auth: false,
  });

export const login = (username, password) =>
  request("users", "/users/login", {
    method: "POST",
    body: { username, password },
    auth: false,
  });

export const setup2fa = (mfaToken) =>
  request("users", "/users/2fa/setup", {
    method: "POST",
    ...withMfaToken(mfaToken),
  });

export const enable2fa = (mfaToken, code) =>
  request("users", "/users/2fa/enable", {
    method: "POST",
    body: { code: String(code) },
    ...withMfaToken(mfaToken),
  });

export const verify2fa = (mfaToken, code) =>
  request("users", "/users/2fa/verify", {
    method: "POST",
    body: { code: String(code) },
    ...withMfaToken(mfaToken),
  });

export const me = () => request("users", "/users/me");

export const health = () => request("users", "/health", { auth: false });

/** Returns { id, username, agencyCode, agencyName, twoFactorEnabled, createdAt } or null. */
export async function getCurrentUser() {
  try {
    const res = await me();
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.user ?? null;
  } catch {
    return null;
  }
}

// Old monolith routes with no equivalent in the user service. Remove once no page uses them.
export const signup = (userID, password) =>
  request("users", "/api/signup", {
    method: "POST",
    body: { userID, password },
    auth: false,
  });

export const forgotPassword = (userID, password, confirmPassword) =>
  request("users", "/api/forgot_password", {
    method: "POST",
    body: { userID, password, confirmPassword },
    auth: false,
  });

export const listUsers = () => request("users", "/api/users");
