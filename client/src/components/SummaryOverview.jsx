import { useEffect, useRef, useState } from "react";
import { visualization } from "../services";
import { USE_VISUALIZATION_MOCKS } from "../config";
import "../styles/Insights.css";

const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const count = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;
const timestamp = (value) =>
  text(value) && Number.isFinite(Date.parse(value)) ? value : null;
const valueLabel = (value) =>
  (typeof value === "number" && Number.isFinite(value)) || text(value)
    ? String(value)
    : null;
const statuses = {
  not_connected: "Not connected",
  running: "Running",
  ok: "OK",
  failed: "Failed",
};
const stockCounts = (row) => {
  const capacity = count(row?.capacity),
    available = count(row?.available);
  return capacity !== null && available !== null && available <= capacity
    ? { capacity, available, out: capacity - available }
    : null;
};

export default function SummaryOverview() {
  const [result, setResult] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(true);
  useEffect(() => {
    let current = true;
    visualization
      .getVisualization()
      .then(async (response) => {
        const data = await response.json();
        if (
          !response.ok ||
          !data ||
          ![data.metrics, data.hardware, data.pipelines].some(Array.isArray)
        )
          throw Error("Summary unavailable");
        if (current)
          setResult({
            status: "ready",
            data,
            receivedAt: new Date().toISOString(),
          });
      })
      .catch(() => {
        if (current)
          setResult((previous) => ({ ...previous, status: "error" }));
      })
      .finally(() => {
        if (current) pending.current = false;
      });
    return () => {
      current = false;
    };
  }, [attempt]);
  const refresh = () => {
    if (pending.current) return;
    pending.current = true;
    setResult((previous) => ({ ...previous, status: "loading" }));
    setAttempt((value) => value + 1);
  };
  const data = result.data;
  const metrics = Array.isArray(data?.metrics) ? data.metrics : null;
  const hardware = Array.isArray(data?.hardware) ? data.hardware : null;
  const pipelines = Array.isArray(data?.pipelines) ? data.pipelines : null;
  const generatedAt = timestamp(data?.generatedAt);
  const incomplete =
    data &&
    (!metrics ||
      !hardware ||
      !pipelines ||
      metrics.some(
        (metric) => !text(metric?.label) || valueLabel(metric.value) === null,
      ) ||
      hardware.some((row) => !text(row?.name) || !stockCounts(row)) ||
      pipelines.some(
        (row) => !text(row?.name) || !Object.hasOwn(statuses, row.status),
      ) ||
      (data.generatedAt != null && !generatedAt));
  return (
    <div className="insights-overview">
      {USE_VISUALIZATION_MOCKS && (
        <div className="workspace-sample insights-sample" role="note">
          <strong>Sample summary metrics</strong>
          <span>Example data only · not live agency or inventory figures</span>
        </div>
      )}
      <section className="insights-section" aria-label="Resource overview">
        <div className="insights-heading">
          <div>
            <p className="workspace-eyebrow">RESOURCE OVERVIEW</p>
            <h2>Summary metrics</h2>
          </div>
          <button
            className="workspace-button secondary"
            type="button"
            onClick={refresh}
            disabled={result.status === "loading"}
          >
            {result.status === "loading"
              ? "Loading summary…"
              : USE_VISUALIZATION_MOCKS
                ? "Reload sample"
                : "Refresh summary"}
          </button>
        </div>
        {data && result.status === "error" && (
          <div className="insights-state" role="alert">
            <strong>Refresh failed. Showing an earlier response.</strong>
            <p>
              These figures may be out of date. The source timestamp below has
              not changed. Try again when the summary source is available.
            </p>
          </div>
        )}
        {data && result.status === "loading" && (
          <p className="insights-refresh-notice" role="status">
            Refreshing summary… Showing the previous response until it
            completes.
          </p>
        )}
        {!data && result.status === "loading" ? (
          <p role="status">Loading summary metrics…</p>
        ) : !data && result.status === "error" ? (
          <div className="insights-state" role="status">
            <h3>Summary source unavailable</h3>
            <p>Summary metrics unavailable.</p>
            <p>
              We couldn’t load the summary. Try again later. You can still open
              vendor comparison.
            </p>
          </div>
        ) : (
          <>
            <p className="workspace-muted insights-description">
              Source-reported figures. Agency totals are not available here.
            </p>
            {incomplete && (
              <div className="insights-state insights-quality" role="note">
                <strong>Some summary data is unavailable</strong>
                <p>
                  Some figures could not be read. Available figures remain
                  visible; missing figures are not counted as zero.
                </p>
              </div>
            )}
            {metrics === null ? (
              <p>Metric values unavailable.</p>
            ) : metrics.length === 0 ? (
              <p>No summary metrics returned.</p>
            ) : !metrics.some((metric) => text(metric?.label)) ? (
              <p>No usable metric rows returned.</p>
            ) : (
              <section
                className="insights-metrics"
                aria-label="Summary metrics"
              >
                {metrics.map(
                  (metric, index) =>
                    text(metric?.label) && (
                      <article
                        className="insights-card"
                        aria-label={metric.label}
                        key={`${metric.key || metric.label}-${index}`}
                      >
                        <h3>{metric.label}</h3>
                        <p className="insights-value">
                          {valueLabel(metric.value) ?? "—"}
                        </p>
                        {valueLabel(metric.value) === null && (
                          <p className="workspace-muted">Unavailable</p>
                        )}
                      </article>
                    ),
                )}
              </section>
            )}
            <section className="insights-panel" aria-labelledby="stock-title">
              <div className="insights-heading">
                <div>
                  <h3 id="stock-title">Shared hardware inventory</h3>
                  <p>
                    Shared stock across agencies · not your agency’s allocation
                  </p>
                </div>
              </div>
              {hardware === null ? (
                <p>Hardware counts unavailable.</p>
              ) : hardware.length === 0 ? (
                <p>No hardware rows returned.</p>
              ) : !hardware.some((row) => text(row?.name)) ? (
                <p>No usable hardware rows returned.</p>
              ) : (
                <ul className="insights-stock-list">
                  {hardware.map((row, index) => {
                    if (!text(row?.name)) return null;
                    const numbers = stockCounts(row),
                      valid = Boolean(numbers),
                      { capacity, available, out } = numbers || {};
                    const percent =
                      valid && capacity > 0
                        ? Math.round((out / capacity) * 100)
                        : null;
                    return (
                      <li key={`${row.name}-${index}`}>
                        <div className="insights-stock-heading">
                          <h4>{row.name}</h4>
                          <span>
                            {valid
                              ? `${out} checked out · ${available} available · ${capacity} total`
                              : "Counts unavailable"}
                          </span>
                        </div>
                        {percent !== null && (
                          <div
                            className="insights-stock-bar"
                            role="meter"
                            aria-label={`${row.name} checked out`}
                            aria-valuemin={0}
                            aria-valuemax={capacity}
                            aria-valuenow={out}
                            aria-valuetext={`${out} of ${capacity} units checked out; ${available} available`}
                          >
                            <span style={{ width: `${percent}%` }} />
                          </div>
                        )}
                        {valid && capacity === 0 && (
                          <p className="workspace-muted">
                            No capacity reported.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </section>
      <div className="insights-detail-grid">
        <section
          className="insights-panel"
          aria-labelledby="agency-insights-title"
        >
          <p className="workspace-eyebrow">AGENCY INSIGHTS</p>
          <h2 id="agency-insights-title">Agency comparison unavailable</h2>
          <p>
            Your agency’s comparison with an all-agency average is not available
            yet. No other agencies’ figures are shown.
          </p>
          <p className="workspace-muted">
            Agency allocation, spend and history summaries aren’t available here
            yet. Use Projects for current project details.
          </p>
        </section>
        <section className="insights-panel" aria-labelledby="data-health-title">
          <p className="workspace-eyebrow">DATA HEALTH</p>
          <h2 id="data-health-title">Source and freshness</h2>
          <dl className="insights-health">
            <div>
              <dt>Summary response</dt>
              <dd>
                {result.status === "loading"
                  ? "Loading…"
                  : result.status === "error"
                    ? data
                      ? "Earlier response · refresh failed"
                      : "Unavailable"
                    : "Response received"}
              </dd>
            </div>
            <div>
              <dt>Source timestamp</dt>
              <dd>
                {generatedAt ? (
                  <time dateTime={generatedAt}>
                    {new Date(generatedAt).toLocaleString()}
                  </time>
                ) : (
                  "Not provided"
                )}
              </dd>
            </div>
            <div>
              <dt>Browser received response</dt>
              <dd>
                {result.receivedAt ? (
                  <time dateTime={result.receivedAt}>
                    {new Date(result.receivedAt).toLocaleString()}
                  </time>
                ) : (
                  "Not received"
                )}
              </dd>
            </div>
            <div>
              <dt>Provider record validation</dt>
              <dd>Not provided</dd>
            </div>
          </dl>
          <p className="workspace-muted">
            Browser receipt time shows when these figures loaded. It does not
            confirm fresh source data; check the source timestamp for their age.
          </p>
          {pipelines && pipelines.some((row) => text(row?.name)) && (
            <div className="insights-pipelines">
              <h3>Source-reported pipeline status</h3>
              <p className="workspace-muted">
                {USE_VISUALIZATION_MOCKS
                  ? "Example pipeline rows; no live refresh or ingestion is shown."
                  : "Status provided with the summary."}
              </p>
              <ul>
                {pipelines.map(
                  (pipeline, index) =>
                    text(pipeline?.name) && (
                      <li key={`${pipeline.id || pipeline.name}-${index}`}>
                        <strong>{pipeline.name}</strong>
                        <span>
                          {Object.hasOwn(statuses, pipeline.status)
                            ? statuses[pipeline.status]
                            : "Status unavailable"}
                        </span>
                        <small>
                          Last run:{" "}
                          {timestamp(pipeline.lastRun)
                            ? new Date(pipeline.lastRun).toLocaleString()
                            : "Not provided"}
                        </small>
                      </li>
                    ),
                )}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
