// Hardware service client. The server forwards requests to HARDWARE_API_BASE_URL.

import { request } from "./http";

export const listHardware = (params = {}) =>
  request("hardware", `/api/hardware?${new URLSearchParams(params)}`);

export const listAllocations = (projectId, params = {}) =>
  request("hardware", `/api/allocations?${new URLSearchParams({ ...params, project_id: projectId })}`);

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

export const setAllocation = ({ hardwareId, projectId, expectedVersion, quantity, reason }) =>
  request("hardware", `/api/hardware/${encodeURIComponent(hardwareId)}/allocations/${encodeURIComponent(projectId)}`, {
    method: "PUT",
    body: { expected_version: expectedVersion, reason, quantity },
  });

export const checkout = ({ name, hardwareId, quantity, projectId }) =>
  request("hardware", "/api/hardware/checkout", {
    method: "POST",
    body: { name, hardwareId, quantity, projectId },
  });

export const checkin = ({ name, hardwareId, quantity, projectId }) =>
  request("hardware", "/api/hardware/checkin", {
    method: "POST",
    body: { name, hardwareId, quantity, projectId },
  });
