// Presentation-only sample for the unconfirmed Overview aggregate.
// Independent of real Users, Projects, Hardware and their API requests.
// No generatedAt: a placeholder must not claim current provider freshness.
export const overviewSample = {
  metrics: [
    { key: "projects", label: "Example project count", value: 2 },
    { key: "hwCapacity", label: "Example hardware capacity", value: 100 },
    { key: "hwOut", label: "Example units checked out", value: 20 },
    { key: "hwAvailable", label: "Example units available", value: 80 },
  ],
  hardware: [{ name: "Example hardware set", capacity: 100, available: 80 }],
  pipelines: [
    {
      id: "example-pipeline",
      name: "Example pipeline",
      status: "not_connected",
      lastRun: null,
    },
  ],
};
