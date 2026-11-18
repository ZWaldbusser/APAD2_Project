import { useEffect, useId, useRef } from "react";
import { Link } from "react-router-dom";

export default function MembershipDialog({
  project,
  profile,
  action,
  onCancel,
  onConfirm,
  busy = false,
  error,
  needsSignIn,
  onRefresh,
}) {
  const dialog = useRef(null);
  const cancel = useRef(null);
  const errorSummary = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const verb = action === "join" ? "Join" : "Leave";
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element.showModal();
    cancel.current.focus();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (error) errorSummary.current?.focus();
  }, [error]);
  const dismiss = (event) => {
    event.preventDefault();
    if (!busy) onCancel();
  };
  return (
    <dialog
      ref={dialog}
      className="membership-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      tabIndex={-1}
      onCancel={dismiss}
      onKeyDown={(event) => {
        if (event.key === "Escape") dismiss(event);
        if (event.key !== "Tab") return;
        const controls = [
          ...dialog.current.querySelectorAll("button:not(:disabled), a[href]"),
        ];
        if (!controls.length) {
          event.preventDefault();
          dialog.current.focus();
          return;
        }
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <h2 id={titleId}>
        {verb} {project.projectName}?
      </h2>
      <p id={descriptionId}>
        {action === "join"
          ? "Review the project before joining."
          : "You will leave this project. Review the details before confirming."}
      </p>
      <dl className="workspace-facts">
        <div>
          <dt>Agency</dt>
          <dd>{project.orgId}</dd>
        </div>
        <div>
          <dt>Project ID</dt>
          <dd>{project.projectId}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd>{profile.name}</dd>
        </div>
      </dl>
      {busy && (
        <p role="status">
          {action === "join" ? "Joining project…" : "Leaving project…"}
        </p>
      )}
      {error && (
        <div
          ref={errorSummary}
          className="membership-error"
          role="alert"
          tabIndex={-1}
        >
          <p>{error}</p>
          {needsSignIn && <Link to="/login">Sign in again</Link>}
        </div>
      )}
      <div className="membership-dialog-actions">
        <button
          ref={cancel}
          type="button"
          className="workspace-button secondary"
          disabled={busy}
          onClick={onCancel}
        >
          {action === "join" ? "Cancel" : "Stay in project"}
        </button>
        {error ? (
          <button
            type="button"
            className="workspace-button"
            onClick={onRefresh}
          >
            Refresh membership
          </button>
        ) : (
          <button
            type="button"
            className="workspace-button"
            disabled={busy}
            onClick={onConfirm}
          >
            {verb} project
          </button>
        )}
      </div>
    </dialog>
  );
}
