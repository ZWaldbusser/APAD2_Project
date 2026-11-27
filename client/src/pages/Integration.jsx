import { useWorkspace } from "../context/WorkspaceContext";
import VendorRankings from "../components/VendorRankings";
import SummaryOverview from "../components/SummaryOverview";
import LiveHardwareInventory from "../components/LiveHardwareInventory";
// Preserve the merged vendor form, ranking and watchlist presentation.
import "../styles/Visualization.css";

export default function Integration() {
  const profile = useWorkspace(),
    account = profile?.value;
  return (
    <main className="workspace-page insights-page">
      <div className="workspace-page-heading">
        <div>
          <p className="workspace-eyebrow">RESOURCES & INSIGHTS</p>
          <h1>Integration</h1>
          <p>
            Understand shared resources and compare alternatives for your
            projects.
          </p>
        </div>
        <a className="workspace-button secondary" href="#alternate-vendors">
          Go to vendor comparison
        </a>
      </div>
      {account?.agencyCode && (
        <LiveHardwareInventory key={JSON.stringify([account.agencyCode, account.id])} />
      )}
      <SummaryOverview />
      <div className="insights-vendors" id="alternate-vendors">
        {account?.agencyCode && (
          <VendorRankings
            key={JSON.stringify([account.agencyCode, account.id])}
            agency={account.agencyCode}
            userId={account.id}
          />
        )}
        {profile?.status === "loading" && (
          <p role="status">Verifying your account…</p>
        )}
        {profile && profile.status !== "loading" && !account?.agencyCode && (
          <section className="workspace-panel vendor-ranking">
            <h2>Alternate vendor rankings</h2>
            <p>A verified agency account is required to use project budgets.</p>
            <button
              type="button"
              className="workspace-button secondary"
              onClick={profile.retry}
            >
              Check account again
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
