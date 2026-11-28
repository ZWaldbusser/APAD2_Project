import { Component, useEffect, useState } from "react";
import { Inbox, NovuProvider, useNovu } from "@novu/react";
import "../styles/NotificationInbox.css";

const NOVU_APP_ID = "w7tJlfaANocl";

function BellIcon({ count = 0 }) {
  return (
    <button
      type="button"
      className="notification-bell"
      aria-label={
        count > 0 ? `Notifications, ${count} unread` : "Notifications"
      }
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
        aria-hidden="true"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span className="notification-count" aria-hidden="true">
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
    if (this.state.hasError)
      return <Unavailable onRetry={this.props.onRetry} />;
    return this.props.children;
  }
}

function Unavailable({ onRetry }) {
  return (
    <div className="notification-unavailable">
      <span role="status">Notifications unavailable</span>
      <button type="button" onClick={onRetry}>
        Retry notifications
      </button>
    </div>
  );
}

function ConnectedInbox({ onRetry }) {
  const novu = useNovu();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // Observe the supplied SDK client; do not issue duplicate reads or events.
    const events = [
      "session.initialize.resolved",
      "notifications.list.resolved",
      "notifications.count.resolved",
    ];
    const unsubscribe = events.map((event) =>
      novu.on(event, (result) => {
        if (result.error) setFailed(true);
      }),
    );
    return () => unsubscribe.forEach((stop) => stop());
  }, [novu]);
  if (failed) return <Unavailable onRetry={onRetry} />;
  return (
    <Inbox
      renderBell={(unreadCount) => <BellIcon count={unreadCount.total} />}
    />
  );
}

function InboxSession({ userId }) {
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((value) => value + 1);
  return (
    <NovuErrorBoundary key={attempt} onRetry={retry}>
      <NovuProvider
        applicationIdentifier={NOVU_APP_ID}
        subscriber={{ subscriberId: String(userId) }}
      >
        <ConnectedInbox onRetry={retry} />
      </NovuProvider>
    </NovuErrorBoundary>
  );
}

export default function NotificationInbox({ userId }) {
  if (!userId) return null;
  return (
    <div className="notification-inbox">
      <InboxSession key={String(userId)} userId={userId} />
    </div>
  );
}
