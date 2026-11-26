import { useEffect, useState } from "react";
import { visualization } from "../services";
import { USE_VISUALIZATION_MOCKS } from "../config";
import { useWorkspace } from "../context/WorkspaceContext";
import VendorRankings from "../components/VendorRankings";
import "../styles/ProjectDashboard.css";
import "../styles/Visualization.css";

// Integration page.
// The data pipelines are not connected yet. The page loads from
// services/visualization.js. An explicitly enabled sample is confined to this page.

const STATUS_LABELS = {
  not_connected: "Not connected",
  running: "Running",
  ok: "OK",
  failed: "Failed",
};

function Integration() {
  const profile = useWorkspace();
  const account = profile?.value;
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await visualization.getVisualization();
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !Array.isArray(body?.metrics)
            || !Array.isArray(body.hardware) || !Array.isArray(body.pipelines)) {
          setStatus("error");
          return;
        }
        setData(body);
        setStatus("ready");
      } catch {
        if (cancelled) return;
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
        <div className="projects-header">
          <h1>Integration</h1>
        </div>
        {account?.agencyCode && (
          <VendorRankings
            key={JSON.stringify([account.agencyCode, account.id])}
            agency={account.agencyCode}
            userId={account.id}
          />
        )}
        {profile?.status === "loading" && <p role="status">Verifying your account…</p>}
        {profile && profile.status !== "loading" && !account?.agencyCode && (
          <section className="workspace-panel vendor-ranking">
            <h2>Alternate vendor rankings</h2>
            <p>A verified agency account is required to use project budgets.</p>
            <button type="button" className="workspace-button secondary" onClick={profile.retry}>
              Check account again
            </button>
          </section>
        )}
        {USE_VISUALIZATION_MOCKS && (
          <div className="workspace-sample" role="note">
            <strong>Sample summary metrics</strong>
            <span>
              Example data only · not live agency or inventory figures
            </span>
          </div>
        )}
        <div className="projects-header">
          <h2>Summary metrics</h2>
          {data?.generatedAt && (
            <span className="visualization-updated">
              Updated {new Date(data.generatedAt).toLocaleString()}
            </span>
          )}
        </div>

        {status === "loading" && (
          <p className="visualization-muted">Loading summary metrics…</p>
        )}
        {status === "error" && <p className="error-text">Summary metrics unavailable.</p>}

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

export default Integration;
