import { useEffect, useRef, useState } from "react";
import { readSharedInventory } from "../services/inventory";
import "../styles/Insights.css";

const statuses = {
  active: "Active",
  damaged: "Damaged",
  under_maintenance: "Under maintenance",
  retired: "Retired",
};
const text = (value) => typeof value === "string" && value.trim() !== "";
const count = (value) => Number.isSafeInteger(value) && value >= 0;

function displayableInventory(records) {
  const ids = new Map();
  for (const row of records) ids.set(row?.id, (ids.get(row?.id) || 0) + 1);
  const rows = records.filter(
    (row) =>
      row && text(row.id) && ids.get(row.id) === 1 && text(row.name) &&
      text(row.category) && Object.hasOwn(statuses, row.status) &&
      [row.total, row.reserved, row.out, row.available, row.unallocated].every(count) &&
      row.out <= row.reserved && row.reserved <= row.total &&
      row.available === row.total - row.out &&
      row.unallocated === row.total - row.reserved,
  );
  return { rows, excluded: records.length - rows.length };
}

export default function LiveHardwareInventory() {
  const [result, setResult] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(true);
  useEffect(() => {
    let current = true;
    readSharedInventory()
      .then(displayableInventory)
      .then(
        (inventory) => {
          if (current) setResult({
            status: "ready", ...inventory, receivedAt: new Date().toISOString(),
          });
        },
        () => {
          if (current) setResult((previous) => ({ ...previous, status: "error" }));
        },
      )
      .finally(() => { if (current) pending.current = false; });
    return () => { current = false; };
  }, [attempt]);
  const refresh = () => {
    if (pending.current) return;
    pending.current = true;
    setResult((previous) => ({ ...previous, status: "loading" }));
    setAttempt((value) => value + 1);
  };
  return (
    <section className="insights-section inventory-live" aria-label="Live shared hardware inventory">
      <div className="insights-heading">
        <div>
          <p className="workspace-eyebrow">HARDWARE SERVICE</p>
          <h2>Shared hardware inventory</h2>
        </div>
        <button
          className="workspace-button secondary" type="button"
          onClick={refresh} disabled={result.status === "loading"}
        >
          {result.status === "loading" ? "Refreshing inventory…" : "Refresh inventory"}
        </button>
      </div>
      <p className="workspace-muted insights-description">
        Shared stock across agencies · not your agency’s allocation.
        Available means not checked out; some units may be reserved for other projects.
        Unallocated means not reserved for a project. Reserved includes checked-out units.
      </p>
      {result.status === "loading" && <p role="status">
        {result.rows ? "Showing the previous inventory response while refreshing…" : "Loading shared inventory…"}
      </p>}
      {result.status === "ready" && <p role="status" className="insights-refresh-notice">
        {attempt > 0 ? "Inventory refreshed. " : ""}
        {result.rows.length} hardware {result.rows.length === 1 ? "pool" : "pools"} shown.
      </p>}
      {result.status === "error" && (
        <div className="insights-state insights-quality" role="alert">
          <h3>{result.rows ? "Inventory refresh failed" : "Shared inventory unavailable"}</h3>
          <p>{result.rows
            ? "Showing an earlier response. Counts may be out of date; the receipt time has not changed."
            : "We couldn’t load shared inventory. No counts are available."} Try Refresh inventory again.</p>
        </div>
      )}
      {result.excluded > 0 && (
        <p className="insights-state insights-quality" role="note">
          {result.excluded} {result.excluded === 1 ? "record could" : "records could"} not be displayed.
          Counts cover only the shown records. Try refreshing inventory to check again.
        </p>
      )}
      {result.rows?.length === 0 && <p>
        {result.excluded ? "No usable hardware pools returned. Inventory counts are unavailable." : "No hardware pools returned."}
      </p>}
      {result.rows && (
        <div className="inventory-pools">
          {result.rows.map((pool) => (
            <article className="insights-panel" aria-label={pool.name} key={pool.id}>
              <h3>{pool.name}</h3>
              <p className="workspace-muted">{pool.category} · {statuses[pool.status]}</p>
              <dl className="inventory-counts">
                <div><dt>Total</dt><dd>{pool.total}</dd></div>
                <div><dt>Available</dt><dd>{pool.available}</dd></div>
                <div><dt>Reserved</dt><dd>{pool.reserved}</dd></div>
                <div><dt>Checked out</dt><dd>{pool.out}</dd></div>
                <div><dt>Unallocated</dt><dd>{pool.unallocated}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
      <p className="workspace-muted">Source timestamp: Not provided</p>
      <p className="workspace-muted">
        Browser received inventory:{" "}
        {result.receivedAt ? <time dateTime={result.receivedAt}>{new Date(result.receivedAt).toLocaleString()}</time> : "Not received"}
        . Receipt time shows when this response loaded, not when the source was updated.
      </p>
    </section>
  );
}
