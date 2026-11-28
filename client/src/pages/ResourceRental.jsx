import { useState, useEffect, useCallback } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { hardware } from "../services";
import "../styles/ResourceRental.css";

function ResourceRental() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const orgId = searchParams.get("orgId");
  const [hardwareList, setHardwareList] = useState([]);
  const [checkinQty, setCheckinQty] = useState({});
  const [checkoutQty, setCheckoutQty] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingAction, setPendingAction] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchRows = useCallback(() => hardware.getProjectHardware(projectId), [projectId]);

  useEffect(() => {
    let active = true;
    fetchRows().then((rows) => {
      if (!active) return;
      setHardwareList(rows);
      setCheckinQty({});
      setCheckoutQty({});
      setError("");
    }).catch((err) => {
      if (active) setError(err.message || "Could not load project allocations");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [fetchRows]);

  const handleAction = async (item, action) => {
    if (busy) return;
    setError("");
    setSuccess("");
    const isCheckin = action === "checkin";
    const quantity = Number((isCheckin ? checkinQty : checkoutQty)[item.hardware_id] || 0);
    const limit = isCheckin ? item.checkedOut : item.available;
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > limit) {
      setError(`Enter a whole number between 1 and ${limit} to ${isCheckin ? "check in" : "check out"} ${item.name}.`);
      return;
    }
    setBusy(true);
    setPendingAction({ id: item.hardware_id, action });
    try {
      await hardware.responseData(await hardware[action]({
        name: item.name,
        hardwareId: item.hardware_id,
        quantity,
        projectId,
        orgId,
      }));
      setHardwareList(await fetchRows());
      setCheckinQty({});
      setCheckoutQty({});
      setSuccess(`${quantity} ${quantity === 1 ? "unit" : "units"} of ${item.name} checked ${isCheckin ? "in" : "out"}.`);
    } catch (err) {
      // A return can span several RPCs; reload after errors to show completed writes.
      try { setHardwareList(await fetchRows()); } catch { /* Keep the original action error. */ }
      setError(err.message || "Hardware update failed");
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  };

  const totals = hardwareList.reduce((sum, item) => ({
    allocated: sum.allocated + item.allocated,
    checkedOut: sum.checkedOut + item.checkedOut,
    available: sum.available + item.available,
  }), { allocated: 0, checkedOut: 0, available: 0 });
  const projectUrl = `/projects/${encodeURIComponent(projectId)}${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ""}`;

  return (
    <main className="workspace-page resource-main">
      <Link className="workspace-back" to={projectUrl}>&larr; Back to project</Link>
      <div className="workspace-page-heading resource-heading">
        <div>
          <p className="workspace-eyebrow">Manage equipment</p>
          <h1>Project {projectId}</h1>
          <p>Check out equipment to use it. Check it back in when you are done.</p>
        </div>
      </div>

      {!loading && hardwareList.length > 0 && (
        <dl className="resource-summary" aria-label="Equipment summary">
          <div><dt>Allocated units</dt><dd>{totals.allocated}</dd></div>
          <div><dt>Checked out</dt><dd>{totals.checkedOut}</dd></div>
          <div><dt>Available to use</dt><dd>{totals.available}</dd></div>
        </dl>
      )}

      <div className="resource-feedback" aria-live="polite">
        {success && <p className="resource-success" role="status">{success}</p>}
        {error && <p className="resource-error" role="alert">{error}</p>}
      </div>

      <section className="resource-inventory" aria-labelledby="equipment-heading" aria-busy={loading || busy}>
        <div className="resource-section-heading">
          <h2 id="equipment-heading">Project equipment</h2>
          <p>Choose a quantity, then check in or check out.</p>
        </div>
        {loading ? <p className="resource-empty" role="status">Loading project allocations...</p> : hardwareList.length === 0 ? (
          <p className="resource-empty">{error ? "Equipment could not be loaded." : "No hardware is allocated to this project."}</p>
        ) : (
          <table className="resource-table">
            <caption className="workspace-sr-only">Equipment allocations and check-in / check-out actions for project {projectId}</caption>
            <thead>
              <tr>
                <th scope="col">Equipment</th>
                <th scope="col">Allocated</th>
                <th scope="col">Checked out</th>
                <th scope="col">Available</th>
                <th scope="col">Check in</th>
                <th scope="col">Check out</th>
              </tr>
            </thead>
            <tbody>
              {hardwareList.map((hw) => (
                <tr key={hw.hardware_id}>
                  <td className="resource-item" data-label="Equipment">{hw.name}</td>
                  <td data-label="Allocated">{hw.allocated}</td>
                  <td data-label="Checked out">{hw.checkedOut}</td>
                  <td data-label="Available"><span className={`resource-availability${hw.available === 0 ? " is-empty" : ""}`}>{hw.available}</span></td>
                  {["checkin", "checkout"].map((action) => {
                    const isCheckin = action === "checkin";
                    const limit = isCheckin ? hw.checkedOut : hw.available;
                    const values = isCheckin ? checkinQty : checkoutQty;
                    const setValues = isCheckin ? setCheckinQty : setCheckoutQty;
                    const quantity = Number(values[hw.hardware_id] || 0);
                    const isPending = pendingAction?.id === hw.hardware_id && pendingAction.action === action;
                    const label = isCheckin ? "Check In" : "Check Out";
                    return (
                      <td className="resource-action-cell" key={action}>
                        <form className="resource-action-card" onSubmit={(event) => { event.preventDefault(); handleAction(hw, action); }}>
                          <label className="workspace-sr-only" htmlFor={`${action}-${hw.hardware_id}`}>
                            {isCheckin ? "Check-in" : "Check-out"} quantity for {hw.name}
                          </label>
                          <div className="resource-action-controls">
                            <input
                              id={`${action}-${hw.hardware_id}`}
                              type="number"
                              min="1"
                              step="1"
                              max={limit}
                              placeholder="Qty"
                              required
                              disabled={busy || limit === 0}
                              value={values[hw.hardware_id] ?? ""}
                              aria-describedby={`${action}-hint-${hw.hardware_id}`}
                              onChange={(event) => setValues({ ...values, [hw.hardware_id]: event.target.value })}
                            />
                            <button className={`${action}-submit-btn`} disabled={busy || !Number.isInteger(quantity) || quantity < 1 || quantity > limit}>
                              {isPending ? "Updating..." : label}
                            </button>
                          </div>
                          <span className="resource-action-hint" id={`${action}-hint-${hw.hardware_id}`}>
                            {limit === 0 ? (isCheckin ? "Nothing to return" : "None available") : `Up to ${limit} ${isCheckin ? "to return" : "available"}`}
                          </span>
                        </form>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

export default ResourceRental;
