// Mock Users / Auth service.

import { db, newId, makeToken, ok, err, requireUser } from "./db";

export const usersRoutes = [
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
    return ok({ id: user.id, userid: user.userid, ...(user.agencyCode && { agencyCode: user.agencyCode }) });
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
