import { Component, useState } from "react";
import { Inbox } from "@novu/react";
import { USE_MOCKS } from "../config";

const NOVU_APP_ID = "w7tJlfaANocl";

function BellIcon({ count = 0, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Notifications"
      style={{
        background: "none",
        border: "none",
        padding: 4,
        cursor: "pointer",
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            background: "#e63946",
            color: "white",
            borderRadius: "50%",
            width: 16,
            height: 16,
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

class NovuErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return <BellIcon />;
    return this.props.children;
  }
}

function NotificationInbox({ userId }) {
  const [mockOpen, setMockOpen] = useState(false);

  if (USE_MOCKS) {
    return (
      <div className="notification-inbox" style={{ position: "relative" }}>
        <BellIcon onClick={() => setMockOpen((o) => !o)} />
        {mockOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 8,
              background: "white",
              color: "#333",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              padding: "16px 20px",
              minWidth: 220,
              zIndex: 100,
              fontSize: 14,
            }}
          >
            No notifications yet.
          </div>
        )}
      </div>
    );
  }

  if (!userId) return null;

  return (
    <div className="notification-inbox">
      <NovuErrorBoundary>
        <Inbox
          applicationIdentifier={NOVU_APP_ID}
          subscriber={{ subscriberId: String(userId) }}
          renderBell={(unreadCount) => <BellIcon count={unreadCount} />}
        />
      </NovuErrorBoundary>
    </div>
  );
}

export default NotificationInbox;
