// Hardware service client. The server forwards requests to HARDWARE_API_BASE_URL_grpc via gRPC.

import { request } from "./http";

export const listHardware = (params = {}) =>
  request("hardware", "/api/hardware", { method: "POST", body: params });

export const listAllocations = (projectId, params = {}) =>
  request("hardware", "/api/listAllocations", {
    method: "POST",
    body: { ...params, projectId },
  });

export async function responseData(res) {
  const data = await res.json();
  if (!res.ok) {
    const message = data.error || data.detail || data.message;
    throw new Error(typeof message === "string" ? message : `Hardware request failed (${res.status})`);
  }
  return data;
}

async function allPages(fetchPage) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const data = await responseData(await fetchPage({ page, size: 100 }));
    if (Array.isArray(data)) return data;
    items.push(...data.items);
    if (items.length >= data.total || data.items.length === 0) return items;
  }
}

export const getAllHardware = () => allPages(listHardware);
export const getProjectAllocations = (projectId) =>
  allPages((params) => listAllocations(projectId, params));

export const setAllocation = ({ hardwareId, projectId, expectedVersion, quantity, reason, orgId }) =>
  request("hardware", `/api/hardware/${encodeURIComponent(hardwareId)}/allocations/${encodeURIComponent(projectId)}`, {
    method: "POST",
    body: { expected_version: expectedVersion, reason, quantity, orgId },
  });

export const checkout = ({ name, hardwareId, quantity, projectId, orgId }) =>
  request("hardware", "/api/hardware/checkout", {
    method: "POST",
    body: { name, hardwareId, quantity, projectId, orgId },
  });

export const checkin = ({ name, hardwareId, quantity, projectId, orgId }) =>
  request("hardware", "/api/hardware/checkin", {
    method: "POST",
    body: { name, hardwareId, quantity, projectId, orgId },
  });

// Retry absolute allocations against current inventory versions. Successful writes
// are reported immediately so a partial failure never recreates the project.
export async function allocateProjectHardware({ projectId, orgId, items, onAllocated }) {
  if (!items.length) return [];
  const catalog = await getAllHardware();
  const failures = [];
  for (const item of items) {
    try {
      const current = catalog.find((hw) => (hw.id || hw._id) === item.hardwareId);
      if (!current) throw new Error("Hardware is no longer available");
      await responseData(await setAllocation({
        ...item, projectId, orgId, expectedVersion: current.version,
        reason: `Initial allocation for project ${projectId}`,
      }));
      onAllocated(item.hardwareId);
    } catch (error) {
      failures.push(`${item.name}: ${error.message}`);
    }
  }
  return failures;
}

export async function getProjectHardware(projectId) {
  const [allocations, catalog] = await Promise.all([
    getProjectAllocations(projectId), getAllHardware(),
  ]);
  const byId = new Map(catalog.map((item) => [item.id || item._id, item]));
  return allocations.map((allocation) => ({
    ...allocation,
    name: byId.get(allocation.hardware_id)?.name || allocation.hardware_id,
    allocated: allocation.quantity,
    checkedOut: allocation.out,
    available: Math.max(allocation.quantity - allocation.out, 0),
  }));
}
