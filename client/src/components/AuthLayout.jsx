import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import "../styles/Workspace.css";
import "../styles/Auth.css";

const titles = {
  "/": "Welcome",
  "/login": "Log in",
  "/register": "Create account",
  "/2fa/setup": "Set up two-factor",
  "/2fa/verify": "Verify code",
  "/forgotpassword": "Password recovery",
};
export default function AuthLayout() {
  const location = useLocation(),
    main = useRef(null),
    previous = useRef(location.pathname);
  const verifying = location.pathname.startsWith("/2fa/");
  useEffect(() => {
    document.title = `${titles[location.pathname] || "Account"} · HaaS Hub`;
    if (previous.current !== location.pathname) main.current?.focus();
    previous.current = location.pathname;
  }, [location.pathname]);
  return (
    <div className="auth-shell">
      <a className="auth-skip" href="#auth-content">
        Skip to account content
      </a>
      <aside className="auth-brand-panel">
        <Link className="auth-brand" to="/">
          <span aria-hidden="true" className="auth-brand-mark">
            H
          </span>
          <span>
            HaaS Hub<small>CIVIC WORKSPACE</small>
          </span>
        </Link>
        <div className="auth-brand-content">
          <p className="auth-eyebrow">HARDWARE AS A SERVICE</p>
          <h2>Your agency’s equipment workspace.</h2>
          <p>
            Access your projects and shared equipment with your agency account.
          </p>
          <ol className="auth-steps" aria-label="Account access steps">
            <li aria-current={!verifying ? "step" : undefined}>
              <span aria-hidden="true">1</span>Account details
            </li>
            <li aria-current={verifying ? "step" : undefined}>
              <span aria-hidden="true">2</span>Verify with your app
            </li>
            <li>
              <span aria-hidden="true">3</span>Open your workspace
            </li>
          </ol>
        </div>
        <p className="auth-brand-footer">
          Agency accounts · Two-factor verification
        </p>
      </aside>
      <div className="auth-content-column">
        <main id="auth-content" ref={main} tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="auth-footer">
          HaaS Hub <span>Agency equipment workspace</span>
        </footer>
      </div>
    </div>
  );
}
