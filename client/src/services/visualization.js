// Visualization service client.
//
// The visualization data will come from data pipelines that another team gives us.
// The pipeline API does not exist yet. This route and its response shape are
// PLACEHOLDERS. When the real contract arrives, change only this file and
// src/mocks/visualization.js.

import { request } from "./http";

export const getVisualization = () => request("visualization", "/api/visualization");
