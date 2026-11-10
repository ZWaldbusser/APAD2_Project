import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
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
    const isCheckin = action === "checkin";
    const quantity = Number((isCheckin ? checkinQty : checkoutQty)[item.hardware_id] || 0);
    const limit = isCheckin ? item.checkedOut : item.available;
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > limit) {
      setError(`Enter a whole number between 1 and ${limit} to ${isCheckin ? "check in" : "check out"} ${item.name}.`);
      return;
    }
    setBusy(true);
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
    } catch (err) {
      // A return can span several RPCs; reload after errors to show completed writes.
      try { setHardwareList(await fetchRows()); } catch { /* Keep the original action error. */ }
      setError(err.message || "Hardware update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <main className="resource-main">
        <h2>Project {projectId}</h2>

        {loading && <p role="status">Loading project allocations...</p>}
        <table className="resource-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Allocated</th>
              <th>Rented Out</th>
              <th>Check In</th>
              <th>Check Out</th>
            </tr>
          </thead>
          <tbody>
            {hardwareList.map((hw) => (
              <tr key={hw.hardware_id}>
                <td>{hw.name}</td>
                <td>{hw.allocated}</td>
                <td>{hw.checkedOut}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    disabled={busy}
                    max={hw.checkedOut}
                    value={checkinQty[hw.hardware_id] || 0}
                    onChange={(e) =>
                      setCheckinQty({
                        ...checkinQty,
                        [hw.hardware_id]: e.target.value,
                      })
                    }
                  />
                  <button className="checkin-submit-btn" disabled={busy || hw.checkedOut === 0} onClick={() => handleAction(hw, "checkin")}>
                    Check In
                  </button>
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    disabled={busy}
                    max={hw.available}
                    value={checkoutQty[hw.hardware_id] || 0}
                    onChange={(e) =>
                      setCheckoutQty({
                        ...checkoutQty,
                        [hw.hardware_id]: e.target.value,
                      })
                    }
                  />
                  <button className="checkout-submit-btn" disabled={busy || hw.available === 0} onClick={() => handleAction(hw, "checkout")}>
                    Check Out
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !error && hardwareList.length === 0 && <tr><td colSpan="5">No hardware is allocated to this project.</td></tr>}
          </tbody>
        </table>

        {error && <p className="error-text" role="alert">{error}</p>}

      </main>
    </div>
  );
}

export default ResourceRental;
