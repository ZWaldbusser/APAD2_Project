import { useCallback } from "react";
import { hardware } from "../services";
import { useRead } from "../hooks/useRead";

export default function VendorAlternatives({ project, hardwareId }) {
  const load = useCallback(async () => {
    const result = await hardware.getAvailability(
      hardwareId,
      project.projectId,
      project.orgId,
    );
    if (
      !Array.isArray(result.alternatives) ||
      !["available", "unavailable"].includes(result.availability) ||
      !result.alternatives.every(
        (row) =>
          row &&
          [
            "vendor",
            "commodity",
            "department",
            "source_unit",
            "business_line",
            "category",
          ].every((key) => row[key] == null || typeof row[key] === "string") &&
          ["unit_price", "quantity", "payment_amount", "monthly_charges"].every(
            (key) => row[key] == null || Number.isFinite(row[key]),
          ),
      )
    )
      throw new Error("Invalid alternatives");
    return result;
  }, [hardwareId, project.projectId, project.orgId]);
  const data = useRead(
    load,
    JSON.stringify([hardwareId, project.orgId, project.projectId]),
  );
  const unavailable =
    data.status === "error" ||
    data.value?.alternative_lookup_status === "temporarily_unavailable";
  return (
    <section className="equipment-vendors" aria-label="Vendor alternatives">
      <h3>Vendor alternatives</h3>
      {data.status === "loading" ? (
        <p role="status">Checking vendor alternatives…</p>
      ) : unavailable ? (
        <>
          <p role="status">
            Vendor alternatives are temporarily unavailable. Equipment
            information and returns remain available.
          </p>
          <button className="workspace-button secondary" onClick={data.retry}>
            Retry alternatives
          </button>
        </>
      ) : data.value.availability === "available" ? (
        <p>
          Shared stock has changed. Refresh equipment to see the latest counts.
        </p>
      ) : data.value.alternatives.length === 0 ? (
        <p>No vendor alternatives are available from the service.</p>
      ) : (
        <>
          <p className="workspace-muted">
            Procurement records supplied by the service. These do not establish
            current vendor stock or approved suppliers.
          </p>
          <ul>
            {data.value.alternatives.map((row, index) => (
              <li key={index}>
                <strong>{row.vendor || "Vendor not provided"}</strong>
                <p>
                  {row.commodity || "Commodity not provided"}
                  {row.category ? ` · ${row.category}` : ""}
                </p>
                {row.department && <p>Department: {row.department}</p>}
                {row.source_unit && <p>Source: {row.source_unit}</p>}
                {row.business_line && <p>Business line: {row.business_line}</p>}
                {row.unit_price != null && (
                  <p>
                    Reported unit price:{" "}
                    {row.unit_price.toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                )}
                {row.quantity != null && (
                  <p>Procurement quantity: {row.quantity}</p>
                )}
                {row.payment_amount != null && (
                  <p>Payment amount: {row.payment_amount.toLocaleString()}</p>
                )}
                {row.monthly_charges != null && (
                  <p>Monthly charges: {row.monthly_charges.toLocaleString()}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
