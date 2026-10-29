// Hardware service client.
//
// Checkout and checkin change both the hardware pool and the project.
// The backend team has not decided which service owns this. Keep all pages
// on these two functions. If it becomes two calls (hardware + projects),
// change only this file.

import { request } from "./http";

export const listHardware = () => request("hardware", "/api/hardware");

export const checkout = ({ name, quantity, projectId }) =>
  request("hardware", "/api/hardware/checkout", {
    method: "POST",
    body: { name, quantity, projectId },
  });

export const checkin = ({ name, quantity, projectId }) =>
  request("hardware", "/api/hardware/checkin", {
    method: "POST",
    body: { name, quantity, projectId },
  });
