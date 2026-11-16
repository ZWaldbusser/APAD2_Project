import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { hardware, users } from '../services';
import { db } from '../mocks/db';

vi.mock('../config', () => ({ USE_MOCKS: true, MOCK_DELAY_MS: 0 }));
let snapshot;
beforeEach(() => {
  snapshot = structuredClone(db);
  localStorage.setItem('token', 'mock-token.u1');
});
afterEach(() => {
  Object.assign(db, snapshot);
  localStorage.clear();
});

test('the current profile fixture never invents an agency for an unassigned user', async () => {
  localStorage.setItem('token', 'mock-token.u4');
  const { user } = await (await users.me()).json();
  expect(user.id).toBe('u4');
  expect(user.agencyCode).toBeUndefined();
});

test('the real Hardware client reads catalog and allocation fixtures and reflects a local return/checkout round trip', async () => {
  const initial = await hardware.getProjectHardware('P1');
  expect(initial).toEqual([expect.objectContaining({ hardware_id: 'HW001', name: 'HWSet1', allocated: 20, checkedOut: 20, available: 0 })]);
  const action = { name: 'HWSet1', hardwareId: 'HW001', projectId: 'P1', orgId: 'AUS', quantity: 1 };
  expect((await hardware.checkin(action)).ok).toBe(true);
  expect(await hardware.getProjectHardware('P1')).toEqual([expect.objectContaining({ allocated: 20, checkedOut: 19, available: 1 })]);
  expect((await hardware.checkout(action)).ok).toBe(true);
  expect(await hardware.getProjectHardware('P1')).toEqual(initial);
  expect(await hardware.getProjectHardware('P2')).toEqual([]);
});
