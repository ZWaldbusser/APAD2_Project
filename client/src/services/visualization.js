// Visualization service client.
//
// The visualization data will come from data pipelines that another team gives us.
// No Overview aggregate contract/adapter is confirmed on this branch. Its shape is
// PLACEHOLDERS. When the real contract arrives, change only this file and
// the isolated Overview sample. No confirmed service API is intercepted.

import { request } from "./http";
import { USE_VISUALIZATION_MOCKS } from "../config";

export async function getVisualization() {
  if (USE_VISUALIZATION_MOCKS) {
    const { overviewSample } = await import("../samples/overview");
    return new Response(JSON.stringify(overviewSample), {
      headers: { "Content-Type": "application/json" },
    });
  }
  return request("visualization", "/api/visualization");
}
