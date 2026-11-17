import { useEffect, useState } from "react";
import { visualization } from "../services";
import { USE_VISUALIZATION_MOCKS } from "../config";
import "../styles/ProjectDashboard.css";
import "../styles/Visualization.css";

// Visualization page.
// The data pipelines are not connected yet. The page loads from
// services/visualization.js. An explicitly enabled sample is confined to this page.

const STATUS_LABELS = {
  not_connected: "Not connected",
  running: "Running",
  ok: "OK",
  failed: "Failed",
};

function Visualization() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await visualization.getVisualization();
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error || "Could not load visualization");
          setStatus("error");
          return;
        }
        setData(body);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setError("Could not reach server");
        setStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <main className="page-main">
        {USE_VISUALIZATION_MOCKS && (
          <div className="workspace-sample" role="note">
            <strong>Sample Overview</strong>
            <span>
              Example data only · not live agency or inventory figures
            </span>
          </div>
        )}
        <div className="projects-header">
          <h2>Visualization</h2>
          {data?.generatedAt && (
            <span className="visualization-updated">
              Updated {new Date(data.generatedAt).toLocaleString()}
            </span>
          )}
        </div>

        {status === "loading" && (
          <p className="visualization-muted">Loading visualization...</p>
        )}
        {status === "error" && <p className="error-text">{error}</p>}

        {status === "ready" && (
          <>
            <section
              className="visualization-metrics"
              aria-label="Summary metrics"
            >
              {data.metrics.map((m) => (
                <div className="visualization-card" key={m.key}>
                  <span className="visualization-card__label">{m.label}</span>
                  <span className="visualization-card__value">{m.value}</span>
                </div>
              ))}
            </section>

            <section className="visualization-section">
              <h3>Hardware Usage</h3>
              {data.hardware.map((hw) => {
                const out = hw.capacity - hw.available;
                const pct = hw.capacity
                  ? Math.round((out / hw.capacity) * 100)
                  : 0;
                return (
                  <div
                    className="project-row visualization-hw-row"
                    key={hw.name}
                  >
                    <span className="visualization-hw-name">{hw.name}</span>
                    <div
                      className="visualization-bar"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${hw.name} usage`}
                    >
                      <div
                        className="visualization-bar__fill"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="visualization-hw-count">
                      {out} / {hw.capacity} out
                    </span>
                  </div>
                );
              })}
            </section>

            <section className="visualization-section">
              <h3>Data Pipelines</h3>
              <p className="visualization-muted">
                {USE_VISUALIZATION_MOCKS
                  ? "Example pipeline rows; no live refresh or ingestion is shown."
                  : "Pipeline status from the configured data source."}
              </p>
              {data.pipelines.map((p) => (
                <div className="project-row" key={p.id}>
                  <span>{p.name}</span>
                  <span
                    className={`visualization-status visualization-status--${p.status}`}
                  >
                    {STATUS_LABELS[p.status] || p.status}
                  </span>
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default Visualization;
