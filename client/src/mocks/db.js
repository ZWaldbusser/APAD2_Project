// In-memory mock data — matches Projects API v1.4 contract.
// Data resets when the page reloads.
//
// Seed login:  demo / demo

export const db = {
  users: [
    { id: "u1", userid: "demo", password: "demo" },
    { id: "u2", userid: "teammate", password: "teammate" },
  ],
  projects: [
    {
      id: "p1",
      orgId: "AUS",
      projectID: "P1",
      name: "Demo Project",
      description: "Seed project for mock mode",
      creatorId: "u1",
      budget: 50000,
      hardwareList: [{ hardwareId: "HW001", allocation: 20 }],
      users: ["u1"],
      hwSets: { HWSet1: 20 },
    },
    {
      id: "p2",
      orgId: "DAL",
      projectID: "P2",
      name: "Teammate Project",
      description: "Join this one to test /join",
      creatorId: "u2",
      budget: 10000,
      hardwareList: [],
      users: ["u2"],
      hwSets: {},
    },
  ],
  hardware: [
    { id: "h1", name: "HWSet1", capacity: 100, available: 80 },
    { id: "h2", name: "HWSet2", capacity: 100, available: 100 },
  ],
};

let nextId = 100;
export const newId = (prefix) => `${prefix}${nextId++}`;

// Mock tokens are NOT JWTs. Format: "mock-token.<userId>"
export const makeToken = (userId) => `mock-token.${userId}`;
export const userIdFromToken = (token) =>
  token && token.startsWith("mock-token.") ? token.slice("mock-token.".length) : null;

// Response helpers
export const ok = (data, status = 200) => ({ status, data });
export const err = (status, error) => ({ status, data: { error } });

export function requireUser(token) {
  const userId = userIdFromToken(token);
  if (!userId) return { error: err(401, "Missing token") };
  if (!db.users.some((u) => u.id === userId)) return { error: err(401, "Invalid token") };
  return { userId };
}
