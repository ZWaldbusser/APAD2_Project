import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { hardware, users, projects } from "../services";
import { db } from "../mocks/db";

vi.mock("../config", () => ({ USE_MOCKS: true, MOCK_DELAY_MS: 0 }));
let snapshot;
beforeEach(() => {
  snapshot = structuredClone(db);
  localStorage.setItem("token", "mock-token.u1");
});
afterEach(() => {
  Object.assign(db, snapshot);
  localStorage.clear();
  sessionStorage.clear();
});

test("planned creation metadata does not become a real mock allocation until the existing Hardware write succeeds", async () => {
  const result = await projects.createProject({
    orgId: "AUS",
    projectId: "CIVIC-MOCK",
    projectName: "Mock creation",
    projectDesc: "Sample only",
    creatorId: "u1",
    budget: 0,
    hardwareList: [
      { hardwareId: "HW001", allocation: 3 },
      { hardwareId: "HW002", allocation: 2 },
    ],
  });
  expect(result.ok).toBe(true);
  expect(await hardware.getProjectHardware("CIVIC-MOCK")).toEqual([]);
  sessionStorage.setItem("haas-project-fixture", "allocation-partial");
  const allocated = [];
  const items = [
    { hardwareId: "HW001", name: "HWSet1", quantity: 3 },
    { hardwareId: "HW002", name: "HWSet2", quantity: 2 },
  ];
  expect(
    await hardware.allocateProjectHardware({
      projectId: "CIVIC-MOCK",
      orgId: "AUS",
      items,
      onAllocated: (id) => allocated.push(id),
    }),
  ).toHaveLength(1);
  expect(await hardware.getProjectHardware("CIVIC-MOCK")).toEqual([
    expect.objectContaining({ hardware_id: "HW001", allocated: 3 }),
  ]);
  expect(
    await hardware.allocateProjectHardware({
      projectId: "CIVIC-MOCK",
      orgId: "AUS",
      items: items.filter((x) => !allocated.includes(x.hardwareId)),
      onAllocated: (id) => allocated.push(id),
    }),
  ).toEqual([]);
  expect(await hardware.getProjectHardware("CIVIC-MOCK")).toHaveLength(2);
});

test("the current profile fixture never invents an agency for an unassigned user", async () => {
  localStorage.setItem("token", "mock-token.u4");
  const { user } = await (await users.me()).json();
  expect(user.id).toBe("u4");
  expect(user.agencyCode).toBeUndefined();
});

test("the real Hardware client reads catalog and allocation fixtures and reflects a local return/checkout round trip", async () => {
  const initial = await hardware.getProjectHardware("P1");
  expect(initial).toEqual([
    expect.objectContaining({
      hardware_id: "HW001",
      name: "HWSet1",
      allocated: 20,
      checkedOut: 20,
      available: 0,
    }),
  ]);
  const action = {
    name: "HWSet1",
    hardwareId: "HW001",
    projectId: "P1",
    orgId: "AUS",
    quantity: 1,
  };
  expect((await hardware.checkin(action)).ok).toBe(true);
  expect(await hardware.getProjectHardware("P1")).toEqual([
    expect.objectContaining({ allocated: 20, checkedOut: 19, available: 1 }),
  ]);
  expect((await hardware.checkout(action)).ok).toBe(true);
  expect(await hardware.getProjectHardware("P1")).toEqual(initial);
  expect(await hardware.getProjectHardware("P2")).toEqual([]);
});
