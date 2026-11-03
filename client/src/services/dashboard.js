// Dashboard service client.
//
// The dashboard data will come from data pipelines that another team gives us.
// The pipeline API does not exist yet. This route and its response shape are
// PLACEHOLDERS. When the real contract arrives, change only this file and
// src/mocks/dashboard.js.

import { request } from "./http";

export const getDashboard = () => request("dashboard", "/api/dashboard");
