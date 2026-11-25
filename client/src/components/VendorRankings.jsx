import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { hardware, projects } from "../services";
import { useRead } from "../hooks/useRead";

const MAX_QUANTITY = 2147483647;
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const unitCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});
const dollars = (value) => currency.format(value);

function BenchmarkDifference({ value }) {
  if (value === null) return null;
  const direction = Math.sign(value);
  const amount = direction < 0 ? value.slice(1) : value;
  return (
    <span className="vendor-price">
      {direction === 0
        ? "Matches the typical estimate"
        : `${dollars(amount)} ${direction < 0 ? "below" : "above"} the typical estimate`}
    </span>
  );
}

function WatchlistAction({ name, saved, pendingVendor, onUpdate }) {
  return (
    <div className="vendor-watchlist-actions">
      {saved ? (
        <span className="vendor-watchlist-saved">Saved vendor</span>
      ) : (
        <button
          type="button"
          className="workspace-button secondary vendor-watchlist-action"
          aria-label={`Save ${name} to watchlist`}
          disabled={Boolean(pendingVendor)}
          onClick={() => onUpdate(name, true)}
        >
          {pendingVendor === name ? "Saving…" : "Watchlist"}
        </button>
      )}
      {saved && (
        <button
          type="button"
          className="workspace-button secondary vendor-watchlist-action"
          aria-label={`Remove ${name} from watchlist`}
          disabled={Boolean(pendingVendor)}
          onClick={() => onUpdate(name, false)}
        >
          {pendingVendor === name ? "Removing…" : "Remove"}
        </button>
      )}
    </div>
  );
}

function RankingResult({ result, preferredVendors, onWatchlistUpdate }) {
  const [pendingVendor, setPendingVendor] = useState("");
  const [watchlistError, setWatchlistError] = useState(null);
  const updateWatchlist = async (name, saved) => {
    if (pendingVendor) return;
    setPendingVendor(name);
    setWatchlistError(null);
    try {
      const response = await hardware.updateRankingVendor(name, saved);
      const confirmation = await hardware.responseData(response);
      if (confirmation.saved !== saved) throw new Error("Could not confirm the watchlist change.");
      onWatchlistUpdate(name, saved);
    } catch (error) {
      setWatchlistError({ vendor: name, action: saved ? "save" : "remove", message: error.message });
    } finally {
      setPendingVendor("");
    }
  };
  const { availability, benchmark, excludedRecordCount } = result;
  const savedVendors = new Set(result.savedVendors);
  const comparePreferences = (left, right) =>
    Number(preferredVendors.has(right)) - Number(preferredVendors.has(left))
    || Number(savedVendors.has(right)) - Number(savedVendors.has(left));
  const rankedVendors = [...result.rankedVendors].sort((left, right) =>
    Number(right.withinBudget) - Number(left.withinBudget)
    || comparePreferences(left.vendor, right.vendor),
  );
  const unpricedVendors = [...result.unpricedVendors].sort(comparePreferences);
  return (
    <div className="vendor-ranking-result">
      <h3>{result.hardwareName} · {result.quantity} {result.quantity === 1 ? "unit" : "units"}</h3>
      <p><strong>Total project budget</strong> {dollars(result.projectBudget)} · {result.projectName}</p>
      {benchmark.status === "priced" ? (
        <p>
          <strong>Projects cost benchmark</strong>{" "}
          {dollars(benchmark.estimate.typical)} typical{" "}
          ({dollars(benchmark.estimate.low)}–{dollars(benchmark.estimate.high)})
        </p>
      ) : (
        <p>
          {benchmark.status === "unpriced"
            ? "Projects has no cost benchmark for this item."
            : "The Projects cost benchmark is temporarily unavailable."}
        </p>
      )}

      {availability === "available" && (
        <p>Hardware has stock. Alternate vendor records are available for out-of-stock items.</p>
      )}
      {availability === "temporarily_unavailable" && (
        <p role="status">Vendor lookup is temporarily unavailable. Try again shortly.</p>
      )}
      {availability === "unavailable" && (
        <>
          {watchlistError && (
            <p className="error-text" role="alert">
              Could not {watchlistError.action} <strong>{watchlistError.vendor}</strong><br />
              {watchlistError.message}
            </p>
          )}
          {result.watchlistUnavailable && (
            <p role="status">Saved vendor preferences could not be loaded.</p>
          )}
          {rankedVendors.length > 0 && (
            <>
              <h4>Ranked vendors</h4>
              <p>
                Estimates use historical unit prices, assumed to be USD per requested unit.
                Category estimates can include different models and configurations.
                Confirm the exact configuration, current price, and stock with the vendor.
              </p>
              <ol className="vendor-ranking-list" aria-label="Ranked vendors">
                {rankedVendors.map((vendor) => (
                  <li key={vendor.vendor}>
                    <div className="vendor-ranked-row">
                      <div>
                        <strong>{vendor.vendor}</strong>
                        {vendor.recommended && (
                          <span className="vendor-recommended">
                            {vendor.priceBasis === "category" ? "Lowest in-budget estimate" : "Recommended"}
                          </span>
                        )}
                        <span className="vendor-price">{unitCurrency.format(vendor.unitPrice)} median historical unit price</span>
                        <span className="vendor-price">
                          {vendor.priceBasis === "category" ? "Category estimate" : "Model-name match"}
                          {" · "}{vendor.priceRecordCount} {vendor.priceRecordCount === 1 ? "price record" : "price records"}
                        </span>
                        <span className="vendor-price">Procurement commodity: {vendor.commodities.join("; ")}</span>
                      </div>
                      <div>
                        <strong>{dollars(vendor.estimatedTotal)} estimated</strong>
                        <span className="vendor-price">
                          {vendor.withinBudget
                            ? "Within total project budget"
                            : `${dollars(vendor.overBudgetBy)} over total project budget`}
                        </span>
                        <BenchmarkDifference value={vendor.differenceFromTypical} />
                      </div>
                      <WatchlistAction
                        name={vendor.vendor}
                        saved={savedVendors.has(vendor.vendor)}
                        pendingVendor={pendingVendor}
                        onUpdate={updateWatchlist}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
          {rankedVendors.length > 0 && !rankedVendors[0].withinBudget && (
            <p>No priced vendor fits the total project budget.</p>
          )}
          {unpricedVendors.length > 0 && (
            <>
              <h4>Unpriced alternatives</h4>
              <p>These vendors have no comparable historical unit price in the results.</p>
              <ul>
                {unpricedVendors.map((vendor) => (
                  <li key={vendor}>
                    <div className="vendor-unpriced-row">
                      <span>{vendor}</span>
                      <WatchlistAction
                        name={vendor}
                        saved={savedVendors.has(vendor)}
                        pendingVendor={pendingVendor}
                        onUpdate={updateWatchlist}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!rankedVendors.length && !unpricedVendors.length && (
            <p>Hardware returned no matching vendor alternatives for this item.</p>
          )}
          {excludedRecordCount > 0 && (
            <p>
              {excludedRecordCount} {excludedRecordCount === 1 ? "record did" : "records did"} not match the selected model or known commodity categories.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function VendorRankings({ agency, userId }) {
  const loadProjects = useCallback(async () => {
    const response = await projects.searchProjects({ orgId: agency, userId });
    if (response.status === 401) return { expiredSession: true };
    const { projectList } = await hardware.responseData(response);
    return {
      projects: projectList.filter((project) =>
        project.orgId === agency && Array.isArray(project.joined_users) && project.joined_users.includes(userId),
      ),
    };
  }, [agency, userId]);
  const projectOptions = useRead(loadProjects, JSON.stringify([agency, userId]));
  const hardwareOptions = useRead(hardware.getAllHardware, "vendor-hardware-catalog");
  const projectsFailed = projectOptions.status === "error";
  const hardwareFailed = hardwareOptions.status === "error";
  const loadingOptions = projectOptions.status === "loading" || hardwareOptions.status === "loading";
  const expiredSession = projectOptions.value?.expiredSession;
  const projectList = projectOptions.value?.projects;
  const catalog = hardwareOptions.value;
  const retryOptions = () => {
    if (projectsFailed) projectOptions.retry();
    if (hardwareFailed) hardwareOptions.retry();
  };
  const [selection, setSelection] = useState({ projectId: "", hardwareId: "", quantity: "1" });
  const [result, setResult] = useState(null);
  const [preferredTag, setPreferredTag] = useState("");
  const procurementTags = result?.procurementTags || [];
  const preferredVendors = new Set(procurementTags.find(({ tag }) => tag === preferredTag)?.vendors);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const update = (event) => {
    const { name, value } = event.target;
    setSelection((previous) => ({ ...previous, [name]: value }));
    setResult(null);
    setStatus("idle");
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (status === "loading") return;
    const quantity = Number(selection.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) return;
    setStatus("loading");
    setResult(null);
    setPreferredTag("");
    setError("");
    try {
      const response = await hardware.getVendorRankings({ ...selection, quantity });
      setResult(await hardware.responseData(response));
      setStatus("ready");
    } catch (error) {
      setError(error.message || "Vendor rankings are unavailable.");
      setStatus("error");
    }
  };

  return (
    <section className="workspace-panel vendor-ranking" aria-labelledby="vendor-ranking-heading">
      <h2 id="vendor-ranking-heading">Alternate vendor rankings</h2>
      <p>Compare priced alternatives for out-of-stock hardware against your project’s total budget.</p>
      {loadingOptions && <p role="status">Loading projects and hardware…</p>}
      {expiredSession && (
        <p role="alert">Your session expired. <Link to="/login">Sign in again</Link> to load your projects.</p>
      )}
      {projectsFailed && <p role="alert">Could not load your projects from the Projects service.</p>}
      {hardwareFailed && <p role="alert">Could not load the Hardware catalog.</p>}
      {(projectsFailed || hardwareFailed) && (
        <button type="button" className="workspace-button secondary" onClick={retryOptions}>
          Try again
        </button>
      )}
      {projectList && catalog && (
        !projectList.length ? (
          <p>Join or create a project to compare vendors against its budget.</p>
        ) : !catalog.length ? (
          <p>No hardware is listed in the catalog.</p>
        ) : (
          <form className="vendor-ranking-form" onSubmit={submit}>
            <label>
              Project
              <select name="projectId" required value={selection.projectId} onChange={update} disabled={status === "loading"}>
                <option value="">Select a project</option>
                {projectList.map((project) => (
                  <option key={project.projectId} value={project.projectId}>{project.projectName} ({project.projectId})</option>
                ))}
              </select>
            </label>
            {procurementTags.length > 0 && (
              <div className="vendor-ranking-preference">
                <label htmlFor="vendor-procurement-tag">Procurement tag</label>
                <select
                  id="vendor-procurement-tag"
                  value={preferredTag}
                  onChange={(event) => setPreferredTag(event.target.value)}
                  aria-describedby="vendor-procurement-hint"
                >
                  <option value="">No preference</option>
                  {procurementTags.map(({ tag }) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
                <p id="vendor-procurement-hint">Moves tagged suppliers up within each budget group.</p>
              </div>
            )}
            <label>
              Hardware
              <select name="hardwareId" required value={selection.hardwareId} onChange={update} disabled={status === "loading"}>
                <option value="">Select hardware</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}{item.available === 0 ? " (out of stock)" : ""}</option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input name="quantity" type="number" min="1" max={MAX_QUANTITY} step="1" required value={selection.quantity} onChange={update} disabled={status === "loading"} />
            </label>
            <button type="submit" className="workspace-button" disabled={status === "loading"}>
              Compare vendors
            </button>
          </form>
        )
      )}
      {status === "loading" && <p role="status">Checking budget and vendor alternatives…</p>}
      {status === "error" && <p className="error-text" role="alert">{error}</p>}
      <div aria-live="polite">
        {result && (
          <RankingResult
            result={result}
            preferredVendors={preferredVendors}
            onWatchlistUpdate={(name, saved) => setResult((current) => {
              if (current !== result) return current;
              const savedVendors = new Set(current.savedVendors);
              if (saved) savedVendors.add(name);
              else savedVendors.delete(name);
              return { ...current, savedVendors: [...savedVendors] };
            })}
          />
        )}
      </div>
    </section>
  );
}
