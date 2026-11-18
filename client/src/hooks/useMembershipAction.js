import { useEffect, useRef, useState } from "react";
import { projects } from "../services";

export function useMembershipAction(action, project, profile, onSuccess) {
  const pending = useRef(false);
  const active = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const perform = async () => {
    if (pending.current || !project) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNeedsSignIn(false);
    try {
      const operation =
        action === "join" ? projects.joinProject : projects.leaveProject;
      const response = await operation({
        orgId: project.orgId,
        projectId: project.projectId,
        userId: profile.id,
      });
      const data = await response.json().catch(() => null);
      if (!active.current) return;
      if (!response.ok || data?.success !== true) {
        setNeedsSignIn(response.status === 401);
        const detail = [data?.errorMessage, data?.error, data?.detail].find(
          (value) => typeof value === "string" && value.trim(),
        );
        const message =
          response.status === 409
            ? "Membership changed. Refresh membership before trying again."
            : response.status === 401
              ? "Your session may have expired. Sign in again."
              : response.status === 403
                ? "This action is not permitted for your account or agency."
                : response.status === 404
                  ? "This project is no longer available."
                  : "We could not confirm the membership change. Refresh membership before trying again.";
        setError(detail ? `${message} ${detail}` : message);
        return;
      }
      onSuccess(project);
    } catch {
      if (active.current)
        setError(
          "We could not confirm the membership change. Refresh membership before trying again.",
        );
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  return {
    busy,
    error,
    needsSignIn,
    perform,
    reset: () => {
      setError("");
      setNeedsSignIn(false);
    },
  };
}
