import { useEffect, useRef, useState } from "react";

export function useAuthRequest() {
  const pending = useRef(false),
    active = useRef(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const run = async (operation, onResponse) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await operation();
      const data = await response.json().catch(() => null);
      if (active.current) onResponse(response, data);
    } catch {
      if (active.current)
        setError({
          title: "Connection unavailable",
          message:
            "We couldn’t reach the authentication service. Check your connection and try again.",
        });
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
