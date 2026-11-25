import { useEffect, useState } from "react";
import { onDataMeta } from "../services/http";

function ago(seconds) {
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

// Shows when the BFF served a saved snapshot because an upstream service is down.
export default function StaleBanner() {
  const [stale, setStale] = useState(null);

  useEffect(
    () =>
      onDataMeta((meta) => {
        // Latest response per service wins; a live response clears that service's banner.
        setStale((prev) => {
          const next = { ...(prev || {}) };
          if (meta.stale) next[meta.service] = meta;
          else delete next[meta.service];
          return Object.keys(next).length ? next : null;
        });
      }),
    [],
  );

  if (!stale) return null;
  const oldest = Math.max(...Object.values(stale).map((m) => m.ageSeconds));
  return (
    <div role="status" style={{ background: "#fff4d6", color: "#6b4b00", padding: "8px 16px", fontSize: 14 }}>
      Showing saved data from {ago(oldest)} ({Object.keys(stale).join(", ")} service unavailable).
      Changes may be disabled until it recovers.
    </div>
  );
}
