import { useEffect, useRef } from "react";

export default function AuthFeedback({ error }) {
  const summary = useRef(null);
  useEffect(() => {
    if (error) summary.current?.focus();
  }, [error]);
  if (!error) return null;
  return (
    <div className="auth-error" role="alert" tabIndex={-1} ref={summary}>
      <strong>{error.title}</strong>
      {error.message && <p>{error.message}</p>}
      {error.fields && (
        <ul>
          {Object.entries(error.fields).map(([id, message]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(id)?.focus();
                }}
              >
                {message}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
