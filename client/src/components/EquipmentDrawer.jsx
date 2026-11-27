import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { hardware } from "../services";

export default function EquipmentDrawer({
  project,
  row,
  action,
  limit,
  onClose,
  onRefresh,
  onSaved,
  onUncertain,
}) {
  const [quantity, setQuantity] = useState("1");
  const [stage, setStage] = useState("quantity");
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  const dialog = useRef(null),
    cancel = useRef(null),
    field = useRef(null),
    reviewHeading = useRef(null),
    errorSummary = useRef(null);
  const titleId = useId(),
    hintId = useId(),
    errorId = useId();
  const isReturn = action === "checkin";
  const verb = isReturn ? "Return" : "Check out";
  const amount = Number(quantity);
  const nextOut = row.checkedOut + (isReturn ? -amount : amount);
  useEffect(() => {
    const previous = document.activeElement,
      element = dialog.current;
    active.current = true;
    element.showModal();
    field.current.focus();
    return () => {
      active.current = false;
      element.close();
      if (previous?.isConnected) previous.focus();
      else document.getElementById("equipment-title")?.focus();
    };
  }, []);
  useEffect(() => {
    if (stage === "review") reviewHeading.current?.focus();
  }, [stage]);
  useEffect(() => {
    if (error) errorSummary.current?.focus();
  }, [error]);
  const dismiss = (event) => {
    event.preventDefault();
    if (!busy) onClose();
  };
  const review = (event) => {
    event.preventDefault();
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > limit) {
      setError(`Enter a whole number between 1 and ${limit}.`);
      return;
    }
    setError("");
    setStage("review");
  };
  const confirm = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await hardware.responseData(
        await hardware[action]({
          name: row.name,
          hardwareId: row.hardware_id,
          quantity: amount,
          projectId: project.projectId,
          orgId: project.orgId,
        }),
      );
      if (active.current) onSaved();
    } catch (failure) {
      if (!active.current) return;
      setStatus(failure.status);
      setError(
        failure.status === 409
          ? "Equipment changed while you were reviewing. Refresh quantities before trying again."
          : failure.status === 403
            ? "This action is not permitted for your account. Refresh quantities or contact your team."
            : failure.status === 401
              ? "Your session expired. Sign in again before making a change."
              : `The equipment change could not be confirmed.${isReturn ? " Some returns may have completed." : ""} Refresh quantities before trying again.`,
      );
      onUncertain?.();
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="equipment-drawer"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      aria-busy={busy}
      tabIndex={-1}
      onCancel={dismiss}
      onKeyDown={(event) => {
        if (event.key === "Escape") dismiss(event);
        if (event.key !== "Tab") return;
        const controls = [
          ...dialog.current.querySelectorAll(
            "button:not(:disabled), input:not(:disabled), a[href]",
          ),
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
      <div className="equipment-drawer-heading">
        <p className="workspace-eyebrow">
          {stage === "review" ? "REVIEW CHANGE" : "PROJECT EQUIPMENT"}
        </p>
        <button
          className="equipment-close"
          type="button"
          aria-label="Close equipment drawer"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <h2 id={titleId}>
        {verb} {row.name}
      </h2>
      <p id={hintId}>
        {project.projectName} · {project.orgId} · Project {project.projectId}
      </p>
      <dl className="equipment-drawer-counts">
        <div>
          <dt>Project allocation</dt>
          <dd>{row.allocated}</dd>
        </div>
        <div>
          <dt>Checked out</dt>
          <dd>{row.checkedOut}</dd>
        </div>
        <div>
          <dt>Ready in project</dt>
          <dd>{row.available}</dd>
        </div>
      </dl>
      {error && (
        <div
          id={errorId}
          ref={errorSummary}
          className="equipment-error"
          role="alert"
          tabIndex={-1}
        >
          <p>{error}</p>
          {status === 401 && <Link to="/login">Sign in again</Link>}
        </div>
      )}
      {stage === "quantity" ? (
        <form onSubmit={review} noValidate>
          <label htmlFor={`${titleId}-quantity`}>Quantity</label>
          <input
            ref={field}
            id={`${titleId}-quantity`}
            type="number"
            min="1"
            max={limit}
            step="1"
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              setError("");
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          />
          <p className="workspace-muted">
            {isReturn
              ? `You can return up to ${limit} of your outstanding units.`
              : `You can check out up to ${limit} units from this allocation.`}
          </p>
          <div className="equipment-drawer-actions">
            <button
              ref={cancel}
              type="button"
              className="workspace-button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="workspace-button" type="submit">
              Review {isReturn ? "return" : "checkout"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <h3 ref={reviewHeading} tabIndex={-1}>
            Confirm {isReturn ? "return" : "checkout"}
          </h3>
          <p>
            {isReturn ? "Return" : "Check out"} <strong>{amount}</strong>{" "}
            {amount === 1 ? "unit" : "units"} of {row.name}.
          </p>
          <div className="equipment-projection">
            <span>Expected project counts after this change</span>
            <strong>
              {nextOut} checked out · {row.allocated - nextOut} ready in project
            </strong>
          </div>
          {busy && <p role="status">Saving equipment change…</p>}
          <div className="equipment-drawer-actions">
            <button
              ref={cancel}
              className="workspace-button secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            {error ? (
              <button className="workspace-button" onClick={onRefresh}>
                Refresh quantities
              </button>
            ) : (
              <>
                <button
                  className="workspace-button secondary"
                  disabled={busy}
                  onClick={() => {
                    setStage("quantity");
                    queueMicrotask(() => field.current?.focus());
                  }}
                >
                  Back
                </button>
                <button
                  className="workspace-button"
                  disabled={busy}
                  onClick={confirm}
                >
                  Confirm {isReturn ? "return" : "checkout"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
