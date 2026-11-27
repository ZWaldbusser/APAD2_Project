# Projects compatibility review

This fixes the existing UI/Flask boundary for the current Projects service. It
does not restyle the app or add project deletion, dashboards, notification event
sending, a new service or a different agency policy.

## Before and after

- Before: <http://127.0.0.1:5070/projects>, main `5228801` with its previous 10s setting.
- After: <http://127.0.0.1:5071/projects>, branch `codex/projects-v17-compatibility`.

These are local previews on Rohan's laptop, using real adapters and the existing
private configuration. They require real authorized login/MFA. Their screens
match main; separate PRs #27/#28/#30/#31 are not included. Older preview processes
keep their loaded settings until restarted. The private shared setting has been
updated to 60s; new After processes enforce that minimum as well.

Most changes are correctness improvements rather than visual differences:

| Situation                              | Before                                                | After                                                       |
| -------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Provider declines creation             | Adapter can manufacture success; allocation can start | Decline remains false; no success or allocation             |
| Provider declines join/leave           | Can navigate or announce success                      | Current context remains; error is shown                     |
| Browser supplies another member name   | No supported trusted name forwarded                   | Server forwards the matching authenticated profile username |
| Old timeout is 10s                     | Cold requests can be cut short                        | Both transports use at least 60s                            |
| Price source supplies refresh metadata | Field discarded                                       | Original value carried through without time-zone guessing   |

## Short owner check

1. Sign in to After and open existing projects, details and equipment. These read
   journeys should still work with your verified agency and current user ID.
2. With an agreed test project/account, perform one join and one leave. Confirm
   membership behaves normally. With its creator signed in separately, inspect
   the received notification for the member's username. Projects remains the
   event sender; real Novu delivery/subscriber security is a separate check.
3. If a team-approved creation test is available, create a project and confirm the
   existing success/optional-allocation flow. Avoid repeating a successful create
   just because a later allocation failed; the existing partial-allocation retry
   remains unchanged.
4. Explore existing navigation freely. Declined and malformed responses, spoofed
   identity/profile errors and retry limits are covered with isolated providers;
   there is no need to force these on live services.

Automated desktop and phone comparisons used temporary loopback Users/Projects
gRPC providers and browser-only Hardware interception. Before falsely announced a
declined creation and sent an allocation request; After displayed the decline and
sent zero allocations. Declined join/leave stayed in context. Forwarded fixture
names changed from empty to the authenticated profile username. These test
processes were stopped afterward; no runtime mock mode was added to the app.

## Verification and limits

Run `python -m unittest discover -s server/tests -q` and
`npm test --prefix client -- --maxWorkers=2`, plus the build/lint checks.
The tests use actual local gRPC transport and an independent provider descriptor
for mutation response fields. Live reflection verified every message field and
all nine RPC signatures. A read-only live price query reached Projects but returned
UNAVAILABLE after roughly 31s; live price/freshness acceptance remains pending.
No live account, project, membership, allocation or notification writes were made
by the agent. No merge or deployment was performed.

The existing budget REST preference/fallback stays intact. Each gRPC read has at
most two attempts sharing its configured deadline; mutations have one attempt.
The worker configuration was evaluated on Windows; launching Gunicorn and checking
external router/proxy deadlines require the target Unix hosting environment.

PR #27 already checks explicit membership success. Its replacement screens should
be retained when reconciling these small legacy guard edits after landing; do not
reintroduce the old screens or remove the success check. The explicit immediate
user-project-list refresh follow-up and full rejoin journey remain a separate
membership criterion. Novu HMAC, real delivery and other provider gates remain open.

## Teammate setup

Fetch `codex/projects-v17-compatibility` into an isolated checkout. Follow the root
README for a private `.env`, Python dependencies and `npm ci --prefix client`.
Leave `VITE_API_BASE_URL` empty for a same-origin preview, build the client, and run:

```powershell
npm run build --prefix client
python -m flask --app server/app.py run --host 127.0.0.1 --port 5071
```

Use baseline `5228801fe7597c50497ae64ceb61455057ca1023` in another checkout for
Before. Localhost links are not hosted demos and cannot reach Rohan's processes
from another laptop. Keep all credentials server-side and out of Git.
