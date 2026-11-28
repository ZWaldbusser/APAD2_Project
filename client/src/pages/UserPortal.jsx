import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { agencyNames } from "../projectContext";
import WorkspaceState from "../components/WorkspaceState";
import "../styles/Account.css";

export default function UserPortal() {
  const profile = useWorkspace();
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <main className="workspace-page account-page">
      <div className="workspace-page-heading">
        <div>
          <h1>Your account</h1>
          <p>Your identity and agency in this workspace.</p>
        </div>
      </div>
      {profile.status === "loading" ? (
        <WorkspaceState title="Loading account…" loading />
      ) : profile.status === "error" ? (
        <WorkspaceState
          title="Account unavailable"
          action={
            <button
              className="workspace-button secondary"
              onClick={profile.retry}
            >
              Retry account
            </button>
          }
        >
          We couldn’t load your profile. Try again when the service is
          available.
        </WorkspaceState>
      ) : (
        <section className="account-panel" aria-labelledby="account-details">
          <h2 id="account-details">Account details</h2>
          <dl className="account-details">
            <div>
              <dt>Username</dt>
              <dd>{profile.value.name}</dd>
            </div>
            <div>
              <dt>User ID</dt>
              <dd>{profile.value.id}</dd>
            </div>
            <div>
              <dt>Agency</dt>
              <dd>
                {agencyNames[profile.value.agencyCode] || "Agency unavailable"}
                {profile.value.agencyCode && ` (${profile.value.agencyCode})`}
              </dd>
            </div>
            <div>
              <dt>Two-factor authentication</dt>
              <dd>
                {profile.value.twoFactorEnabled === true
                  ? "Enabled"
                  : profile.value.twoFactorEnabled === false
                    ? "Not enabled"
                    : "Status unavailable"}
              </dd>
            </div>
          </dl>
          <p className="workspace-muted">
            Your agency is fixed on your account. It cannot be changed here.
          </p>
        </section>
      )}
      <section className="account-panel" aria-labelledby="account-session">
        <h2 id="account-session">This device</h2>
        <p>
          Sign out to remove this browser’s stored session. This does not sign
          you out on other devices.
        </p>
        <button
          className="workspace-button"
          onClick={() => {
            logout();
            navigate("/login", {
              replace: true,
              state: { notice: "signed-out" },
            });
          }}
        >
          Sign out on this device
        </button>
      </section>
    </main>
  );
}
