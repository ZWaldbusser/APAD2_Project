// Projects service client — matches Projects API v1.4 contract.

import { request } from "./http";

const enc = encodeURIComponent;

// --- Project CRUD ---

export const createProject = ({ orgId, projectId, projectName, projectDesc, creatorId, budget, hardwareList }) =>
  request("projects", "/projects/create_project", {
    method: "POST",
    body: { orgId, projectId, projectName, projectDesc: projectDesc || "", creatorId, budget, hardwareList: hardwareList || [] },
  });

export const joinProject = ({ orgId, projectId, userId }) =>
  request("projects", "/projects/join_project", {
    method: "POST",
    body: { orgId, projectId, userId },
  });

export const leaveProject = ({ orgId, projectId, userId }) =>
  request("projects", "/projects/leave_project", {
    method: "POST",
    body: { orgId, projectId, userId },
  });

export const searchProjects = ({ orgId, projectId } = {}) =>
  request("projects", "/projects/search_project", {
    method: "POST",
    body: { orgId: orgId || null, projectId: projectId || null },
  });

export const getProject = (projectId, orgId) =>
  request("projects", `/projects/${enc(projectId)}?orgId=${enc(orgId)}`);

// --- Price context ---

export const getUnitPrice = (category) =>
  request("projects", "/get_unit_price", {
    method: "POST",
    body: { category },
  });

export const getDepartmentSpend = (keyword) =>
  request("projects", "/get_department_spend", {
    method: "POST",
    body: { keyword },
  });

export const getBudgetContext = ({ orgId, budget, items }) =>
  request("projects", "/get_budget_context", {
    method: "POST",
    body: { orgId, budget, items },
  });
