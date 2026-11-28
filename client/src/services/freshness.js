// Response freshness only; browser storage never contains API snapshots.
let entries = {};
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

export function recordFreshness(key, service, meta) {
  if (!meta || !["live", "cache"].includes(meta.source)) return;
  if (meta.source === "cache" && meta.stale === true) {
    entries = { ...entries, [key]: { service, savedAt: meta.savedAt } };
  } else {
    const next = { ...entries };
    delete next[key];
    entries = next;
  }
  notify();
}

export function clearFreshness() {
  entries = {};
  notify();
}

export const getFreshness = () => entries;
export const subscribeFreshness = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
