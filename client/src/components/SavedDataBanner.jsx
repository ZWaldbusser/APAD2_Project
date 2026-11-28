import { useSyncExternalStore } from "react";
import { getFreshness, subscribeFreshness } from "../services/freshness";

export default function SavedDataBanner() {
  const entries = useSyncExternalStore(subscribeFreshness, getFreshness);
  const stale = Object.values(entries);
  if (!stale.length) return null;
  const services = [...new Set(stale.map(({ service }) => service === "hardware" ? "Hardware" : "Projects"))];
  const dates = stale.map(({ savedAt }) => new Date(savedAt)).filter((date) => !Number.isNaN(date.getTime()));
  const oldest = dates.length ? new Date(Math.min(...dates.map(Number))) : null;
  return (
    <aside className="workspace-saved-data" role="status" aria-live="polite">
      <strong>Showing saved data</strong>
      <span>
        {services.join(" and ")} could not provide fresh data. Some information may have changed.
        {oldest && <> Oldest snapshot: <time dateTime={oldest.toISOString()}>{oldest.toLocaleString()}</time>.</>}
        {" "}Refresh the page to try again. Changes still require live services.
      </span>
    </aside>
  );
}
