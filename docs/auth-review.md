# Authentication refresh review (#15)

This slice refreshes entry, registration, login, two-factor setup/verification,
recovery explanation, and account display. It preserves the existing Users
adapter and `/integration` destination. UT orange is `#BF5700`; white is `#FFFFFF`.

## Local before and after

The author's current-machine previews are:

- Before: <http://127.0.0.1:5055/login>, main `5228801` (includes #29).
- After: <http://127.0.0.1:5056/login>, branch `codex/15-civic-orange-auth`.

These addresses work only on the machine running those servers. They are not
hosted demos, and both use real adapters. There are no demo credentials or
runtime authentication fixtures. Use a team-authorized account and its real
authenticator. Registration creates a real account; use only an agreed test
account when exercising it. Recovery collects no password and sends no reset.

To reproduce on another machine, fetch the branch and create two checkouts:

```powershell
git fetch origin
git worktree add --detach ../apad2-auth-before 5228801fe7597c50497ae64ceb61455057ca1023
git worktree add --detach ../apad2-auth-after origin/codex/15-civic-orange-auth
```

In each checkout, install the README's Python dependencies and run
`npm ci --prefix client`. Configure its own private root `.env` using the
team's service values as described in the README. Do not commit credentials.
Leave `VITE_API_BASE_URL` empty for these same-origin previews, then run
`npm run build --prefix client` in each checkout.

From each checkout, start Flask in a separate terminal (an active Python
environment with the server dependencies is required):

```powershell
# Before checkout
python -m flask --app server/app.py run --host 127.0.0.1 --port 5055
# After checkout, in its own terminal
python -m flask --app server/app.py run --host 127.0.0.1 --port 5056
```

Restart Flask after rebuilding if it started before the build existed. Local
storage is separate per port, so sign in separately on each preview.

## Short acceptance walk

1. Compare `/login` and `/register` in both previews at desktop and phone width.
   After uses the orange/white layout, visible labels and red required markers.
   Submit an empty form: its inline summary receives focus, and error links
   focus the relevant field. Check Tab navigation, password autofill and Show/Hide.
2. Open **Forgot Password?** After explains that recovery is unavailable, offers
   a return to login, and has no password-reset form.
3. Sign in with an existing authorized account and paste its current six-digit
   authenticator code. Returning accounts go directly to code entry. Successful
   MFA opens Integration, preserving vendor rankings/watchlist functionality.
4. With an agreed new test account only, confirm registration's agency choice,
   first-login QR enrollment, hidden/revealable setup key, and code verification.
   Registration alone must not sign you in. If no new test account is available,
   leave this live criterion pending; isolated tests cover the presentation.
5. Open **Account**: verify username, user ID, fixed agency and service-reported
   MFA status. Sign out: return to login with a local sign-out notice; reopening
   Account requires authentication. This is local sign-out, not provider revocation.

Explore the forms freely. Do not deliberately generate provider rate limits or
lock out an account. Automated tests cover rejected codes, rate limits, outages,
expired challenges, duplicate-submit prevention and malformed success responses.

## Verification boundaries

`npm test --prefix client -- --maxWorkers=2` exercises isolated contract-shaped
fixtures; browser checks use test-only request interception. Neither proves
live provider readiness, account migration, agency isolation or token validation.
The normal previews always call real services. No account creation, live login,
MFA submission, deployment or merge was performed by the agent for this slice.
Old-account migration and the reset mechanism remain team/provider decisions.
