import { useEffect, useState } from "react";

// Read-only resources: ignore late responses after a route change or retry.
export function useRead(load, key) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const requestKey = JSON.stringify([key, attempt]);
  useEffect(() => {
    let current = true;
    load().then(
      (value) => {
        if (current) setResult({ key: requestKey, status: "ready", value });
      },
      () => {
        if (current) setResult({ key: requestKey, status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [load, requestKey]);
  return {
    ...(result?.key === requestKey ? result : { status: "loading" }),
    retry: () => setAttempt((value) => value + 1),
  };
}
