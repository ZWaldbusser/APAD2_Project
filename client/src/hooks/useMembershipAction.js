import { useEffect, useRef, useState } from "react";
import { projects } from "../services";
import { isProjectSummary, membershipIds } from "../projectContext";

export function useMembershipAction(action, project, profile, onSuccess) {
  const pending = useRef(false);
  const active = useRef(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
      // A confirmed write is never retried because its following read failed.
      setRefreshing(true);
      let refreshFailed = false;
      try {
        const refreshed = await projects.searchProjects({
          orgId: profile.agencyCode,
          userId: profile.id,
        });
        if (!refreshed.ok) throw new Error("Projects unavailable");
        const { projectList } = await refreshed.json();
        if (
          !Array.isArray(projectList) ||
          !projectList.every(
            (p) =>
              isProjectSummary(p) &&
              p.orgId === profile.agencyCode &&
              membershipIds(p)?.includes(profile.id),
          ) ||
          projectList.some((p) => p.projectId === project.projectId) !==
            (action === "join")
        )
          throw new Error("Membership list not confirmed");
      } catch {
        refreshFailed = true;
      }
      if (active.current) onSuccess(project, refreshFailed);
    } catch {
      if (active.current)
        setError(
          "We could not confirm the membership change. Refresh membership before trying again.",
        );
    } finally {
      pending.current = false;
      if (active.current) {
        setBusy(false);
        setRefreshing(false);
      }
    }
  };
  return {
    busy,
    refreshing,
    error,
    needsSignIn,
    perform,
    reset: () => {
      setError("");
      setNeedsSignIn(false);
    },
  };
}
