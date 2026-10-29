// Projects service client.

import { request } from "./http";

const enc = encodeURIComponent;

export const listMyProjects = () => request("projects", "/api/projects");

export const getProject = (projectID) =>
  request("projects", `/api/projects/${enc(projectID)}`);

export const createProject = ({ projectID, name, description }) =>
  request("projects", "/api/projects", {
    method: "POST",
    body: { projectID, name, description },
  });

export const joinProject = (projectID) =>
  request("projects", `/api/projects/${enc(projectID)}/join`, { method: "POST" });
