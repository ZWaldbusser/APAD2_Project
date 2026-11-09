// Projects service client — matches the new Project microservice API.

import { request } from "./http";

const enc = encodeURIComponent;

export const createProject = ({ projectId, projectName, projectDesc, projectCreatorId, budget, hardwareList }) =>
  request("projects", "/projects/create_project", {
    method: "POST",
    body: { projectId, projectName, projectDesc: projectDesc || "", projectCreatorId, budget, hardwareList: hardwareList || [] },
  });

export const joinProject = ({ projectId, projectCreatorId, userId }) =>
  request("projects", "/projects/join_project", {
    method: "POST",
    body: { projectId, projectCreatorId, userId },
  });

export const leaveProject = ({ projectId, projectCreatorId, userId }) =>
  request("projects", "/projects/leave_project", {
    method: "POST",
    body: { projectId, projectCreatorId, userId },
  });

export const searchProjects = ({ projectId, projectCreatorId } = {}) =>
  request("projects", "/projects/search_project", {
    method: "POST",
    body: { projectId: projectId || null, projectCreatorId: projectCreatorId || null },
  });

export const getProject = (projectId) =>
  request("projects", `/projects/${enc(projectId)}`);
