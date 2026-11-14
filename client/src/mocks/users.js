// Mock Users / Auth service.
//
// Mock-only shortcuts:
//   - Any 6-digit code is accepted, except "000000"
//   - The QR code is a placeholder image; there is nothing to scan.

import { db, newId, makeToken, ok, err, requireUser } from "./db";

const AGENCIES = { AUS: "Austin", DAL: "Dallas", TEX: "Texas" };
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,49}$/;

// Temporary MFA tokens (mfaToken → userId). Only valid for the 2FA endpoints.
const mfaTokens = new Map();

const findByUsername = (name) =>
  db.users.find((u) => (u.username ?? u.userid ?? "").toLowerCase() === name);

const safeUser = (u) => ({
  id: u.id,
  username: u.username ?? u.userid,
  agencyCode: u.agencyCode ?? "AUS",
  agencyName: AGENCIES[u.agencyCode ?? "AUS"],
  twoFactorEnabled: Boolean(u.twoFactorEnabled),
  createdAt: u.createdAt ?? new Date().toISOString(),
});

const bearer = (token) => (token || "").replace(/^Bearer\s+/i, "");

// Look up the user for a 2FA call, or return the 401 the real service would
function requireMfaUser(token) {
  const userId = mfaTokens.get(bearer(token));
  const user = userId && db.users.find((u) => u.id === userId);
  return user ? { user } : { error: err(401, "Missing, invalid, or expired MFA token.") };
}

function finishMfa(user, token) {
  mfaTokens.delete(bearer(token));
  return ok({ accessToken: makeToken(user.id), user: safeUser(user) });
}

const isValidCode = (code) => typeof code === "string" && /^\d{6}$/.test(code) && code !== "000000";

const PLACEHOLDER_QR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
      '<rect width="200" height="200" fill="#eee" stroke="#999"/>' +
      '<text x="100" y="95" font-size="18" text-anchor="middle" font-family="sans-serif">MOCK QR</text>' +
      '<text x="100" y="120" font-size="12" text-anchor="middle" font-family="sans-serif">enter any 6 digits</text>' +
      "</svg>"
  );

export const usersRoutes = [
  ["POST", /^\/api\/users-service\/register$/, (_m, body) => {
    const username = String(body?.username ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const errors = [];
    if (!AGENCIES[body?.agencyCode]) errors.push("Agency code must be AUS, DAL, or TEX.");
    if (!USERNAME_PATTERN.test(username)) errors.push("Username is invalid.");
    if (password.length < 8) errors.push("Password must be at least 8 characters.");
    if (errors.length) return { status: 400, data: { errors } };
    if (findByUsername(username)) return err(409, "Username already exists.");

    const user = {
      id: newId("u"),
      username,
      userid: username, // other mocks still read .userid
      password,
      agencyCode: body.agencyCode,
      twoFactorEnabled: false,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    return ok({ user: safeUser(user) }, 201);
  }],

  ["POST", /^\/api\/users-service\/login$/, (_m, body) => {
    const user = findByUsername(String(body?.username ?? "").trim().toLowerCase());
    if (!user || user.password !== body?.password) return err(401, "Invalid username or password.");
    const mfaToken = `mock-mfa-${newId("m")}`;
    mfaTokens.set(mfaToken, user.id);
    return ok({ mfaToken, nextStep: user.twoFactorEnabled ? "2fa_verify" : "2fa_setup" });
  }],

  ["POST", /^\/api\/users-service\/2fa\/setup$/, (_m, _b, token) => {
    const { user, error } = requireMfaUser(token);
    if (error) return error;
    if (user.twoFactorEnabled) return err(409, "Two-factor authentication is already enabled.");
    user.pendingMfa = true;
    return ok({
      secret: "MOCKSECRETMOCKSECRET",
      otpauthUrl: "otpauth://totp/APAD:mock?secret=MOCKSECRETMOCKSECRET",
      qrCodeDataUrl: PLACEHOLDER_QR,
    });
  }],

  ["POST", /^\/api\/users-service\/2fa\/enable$/, (_m, body, token) => {
    const { user, error } = requireMfaUser(token);
    if (error) return error;
    if (user.twoFactorEnabled) return err(409, "Two-factor authentication is already enabled.");
    if (!user.pendingMfa) return err(400, "Request setup before enabling.");
    if (!isValidCode(body?.code)) return err(401, "Invalid authentication code.");
    user.twoFactorEnabled = true;
    delete user.pendingMfa;
    return finishMfa(user, token);
  }],

  ["POST", /^\/api\/users-service\/2fa\/verify$/, (_m, body, token) => {
    const { user, error } = requireMfaUser(token);
    if (error) return error;
    if (!user.twoFactorEnabled) return err(400, "Two-factor authentication is not enabled.");
    if (!isValidCode(body?.code)) return err(401, "Invalid authentication code.");
    return finishMfa(user, token);
  }],

  ["GET", /^\/api\/users-service\/me$/, (_m, _b, token) => {
    const { userId, error } = requireUser(token);
    if (error) return error;
    const user = db.users.find((u) => u.id === userId);
    if (!user) return err(404, "User not found.");
    return ok({ user: safeUser(user) });
  }],

  // ---- Old monolith routes, kept until no page uses them ----

  ["POST", /^\/api\/signup$/, (_m, body) => {
    if (!body?.userID || !body?.password) return err(400, "userid and password are required");
    if (db.users.some((u) => u.userid === body.userID)) return err(409, "userid already exists");
    const id = newId("u");
    db.users.push({ id, userid: body.userID, password: body.password });
    return ok({ message: "User created", id }, 201);
  }],

  ["POST", /^\/api\/login$/, (_m, body) => {
    if (!body?.userid || !body?.password) return err(400, "userid and password are required");
    const user = db.users.find((u) => u.userid === body.userid && u.password === body.password);
    if (!user) return err(401, "Invalid userid or password");
    return ok({ message: "Login successful", token: makeToken(user.id) });
  }],

  ["GET", /^\/api\/me$/, (_m, _b, token) => {
    const { userId, error } = requireUser(token);
    if (error) return error;
    const user = db.users.find((u) => u.id === userId);
    return ok({ id: user.id, userid: user.userid });
  }],

  ["POST", /^\/api\/forgot_password$/, (_m, body) => {
    if (!body?.userID || !body?.password || !body?.confirmPassword)
      return err(400, "userid and new password are required");
    if (body.password !== body.confirmPassword) return err(400, "Passwords must match");
    const user = db.users.find((u) => u.userid === body.userID);
    if (!user) return err(401, "Invalid userid or password");
    user.password = body.password;
    return ok({ message: "Password  successfully changed" });
  }],

  ["GET", /^\/api\/users$/, () =>
    ok(db.users.map(({ id, userid }) => ({ id, userid }))),
  ],
];