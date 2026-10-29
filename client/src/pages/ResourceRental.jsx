import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { hardware, projects } from "../services";
import "../styles/ResourceRental.css";

function ResourceRental() {
  const { projectId } = useParams();
  const [hardwareList, setHardwareList] = useState([]);
  const [projectHwSets, setProjectHwSets] = useState({});
  const [checkinQty, setCheckinQty] = useState({});
  const [checkoutQty, setCheckoutQty] = useState({});
  const [error, setError] = useState("");

  const loadData = () => {
    Promise.all([
      hardware.listHardware().then((res) => res.json()),
      projects.getProject(projectId).then((res) => res.json()),
    ]).then(([hwData, projData]) => {
      setHardwareList(hwData);
      setProjectHwSets(projData.hwSets || {});
      const initCheckin = {};
      const initCheckout = {};
      hwData.forEach((hw) => {
        initCheckin[hw.name] = 0;
        initCheckout[hw.name] = 0;
      });
      setCheckinQty(initCheckin);
      setCheckoutQty(initCheckout);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCheckout = async () => {
    setError("");
    for (const hw of hardwareList) {
      const checkoutAmt = checkoutQty[hw.name] || 0;
      if (checkoutAmt > 0) {
        const res = await hardware.checkout({ name: hw.name, quantity: checkoutAmt, projectId });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Checkout failed");
          loadData();
          return;
        }
      }
    }
    loadData();
  };

  const handleCheckin = async () => {
    setError("");
    for (const hw of hardwareList) {
      const returnAmt = checkinQty[hw.name] || 0;
      if (returnAmt > 0) {
        const res = await hardware.checkin({ name: hw.name, quantity: returnAmt, projectId });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Check-in failed");
          loadData();
          return;
        }
      }
    }
    loadData();
  };

  return (
    <div>
      <main className="resource-main">
        <h2>Project {projectId}</h2>

        <table className="resource-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Available</th>
              <th>Currently Rented</th>
              <th>Check In Qty</th>
              <th>Checkout Qty</th>
            </tr>
          </thead>
          <tbody>
            {hardwareList.map((hw) => (
              <tr key={hw.name}>
                <td>{hw.name}</td>
                <td>{hw.available}</td>
                <td>{projectHwSets[hw.name] || 0}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max={projectHwSets[hw.name] || 0}
                    value={checkinQty[hw.name] || 0}
                    onChange={(e) =>
                      setCheckinQty({ ...checkinQty, [hw.name]: parseInt(e.target.value) || 0 })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max={hw.available}
                    value={checkoutQty[hw.name] || 0}
                    onChange={(e) =>
                      setCheckoutQty({ ...checkoutQty, [hw.name]: parseInt(e.target.value) || 0 })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {error && <p className="error-text">{error}</p>}

        <div className="checkout-actions">
          <button className="checkin-submit-btn" onClick={handleCheckin}>
            Check In
          </button>
          <button className="checkout-submit-btn" onClick={handleCheckout}>
            Checkout
          </button>
        </div>
      </main>
    </div>
  );
}

export default ResourceRental;
