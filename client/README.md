# React Client

## Direction D workspace

Project browsing uses the official UT digital tokens in `src/styles/Workspace.css`: `--brand-orange: #BF5700` and `--brand-white: #FFFFFF`. Keep workspace surfaces pure white and reuse these tokens in subsequent increments. The earlier Direction A prototype remains independent and unchanged.

## Safe local review

Use Node.js 24 (verified with 24.18.0 / npm 12.0.1). From the repository root in PowerShell:

```powershell
npm ci --prefix client
$env:VITE_USE_MOCKS = 'true'
npm run dev --prefix client -- --host 127.0.0.1 --port 4281 --strictPort
```

Open [the refreshed workspace](http://127.0.0.1:4281/projects). Live services are the default: **set `VITE_USE_MOCKS=true` explicitly** for this review. The process variable overrides root `.env` values. This frontend-only preview needs no backend, MongoDB, service credentials, or live writes. Stop the preview with Ctrl+C and remove the process override with `Remove-Item Env:VITE_USE_MOCKS` before switching to live integration testing.

Sign in with `demo` / `demo`. On the mock MFA setup or verification screen, enter `123456`. The placeholder QR cannot be scanned; only the mock accepts arbitrary six-digit codes other than `000000`. Sign-in lands on Overview; choose **Projects**. Authentication and MFA remain enabled. In-memory sample data, including pending MFA sessions, reset on page reload: if setup expires after a reload, acknowledge the message and log in again. Complete MFA without reloading the page.

The **Sample workspace** banner distinguishes fixtures from provider data. Other accounts: `teammate` / `teammate` demonstrates Dallas, `empty` / `demo` an empty Texas agency, and `unassigned` / `demo` a missing agency. Agency comes from the explicit profile fixture; the UI never invents Austin.

## Before and after on any teammate's machine

From an existing clone, create isolated snapshots once:

```powershell
git fetch origin
git worktree add --detach ..\APAD2-before-pr17 963af1e5371bf2da5c83efbf57322f1ea7fc2714
git worktree add --detach ..\APAD2-after-pr17 origin/feature/10-civic-orange-projects
```

In a separate PowerShell window for each snapshot, install with `npm ci --prefix client`, set `$env:VITE_USE_MOCKS = 'true'`, and start the frontend using the command above. Use port **4280** for the before snapshot and **4281** for after. Then open [before](http://127.0.0.1:4280/projects) and [after](http://127.0.0.1:4281/projects), signing in independently on each port. These localhost links require those servers on the reader's own computer; they are not hosted previews. Reuse existing snapshot folders only if they contain the intended revisions.

The before snapshot is the actual current-main baseline captured for the conflict repair, not the older original PR baseline. Its mock Hardware service lacks the newer POST catalog/allocation reads, so its equipment view reports a mock-route error. After includes compatible local read fixtures. Project seed records, budgets, membership and equipment quantities are otherwise the same; mock hardware IDs now match the seeded allocation IDs.

## Short acceptance walkthrough

1. Search **Demo** or **P1**, open **Demo Project**, then choose **Back to projects**. The search should remain. Project budget, description and membership should display.
2. Open **Manage equipment** directly from the project row, then again from project details. Both links should reach `/projects/P1/resources?orgId=AUS` and show HWSet1 allocated 20, rented out 20. Return one unit, observe 19 rented out, then check out one and observe 20. These are local simulated writes that reset on reload.
3. In development mock mode, use **Review scenario** for empty list, service outage, missing detail, or an independent **Equipment unavailable** outage. In the equipment scenario, open Demo Project: its metadata stays visible with **Retry equipment**. Switch back to Standard data to recover. The missing-detail scenario leaves the list available so you can open a result. Restore **Standard data** afterward. The selector reloads the page and stores only the scenario in that tab's session storage; it never intercepts live requests and is absent from production builds.
4. Repeat project navigation with the keyboard and at phone width. Open/close the mobile menu using Enter and Escape. Explore the rest of the workspace freely.

Create/join/leave, equipment transactions, Overview and account pages keep their existing implementations. Their redesign belongs to later increments. This repair preserves current detail membership gating and direct equipment routing without deciding who is eligible for equipment actions.

## Verification and boundaries

```powershell
npm test --prefix client
npm run build --prefix client
npm run lint --prefix client
```

Router/UI regression tests exercise real service clients with responses supplied at the HTTP boundary; MFA transport tests replace only fetch and the third-party alert UI. Additional tests exercise the real clients against local mock contracts. Browser QA covers the real login/MFA alerts and navigation. Full lint has two existing main-baseline errors in `AuthContext.jsx` and `AuthEntryPage.jsx`; changed files must pass targeted lint.

The workspace reads `GET /api/users-service/me` as `{ user: { id, username, agencyCode, ... } }`. Missing or unsupported agency blocks project browsing; canonical user IDs are compared to `joined_users` for details. Current equipment allocations come from the Hardware client, independently of project details. A Hardware read failure leaves the project visible with an equipment-only retry.

Browser routes retain both orgId and projectId. Hardware reads still use the existing project-ID-only contract: this UI does not establish server tenant isolation or global ID uniqueness. Fixtures, automated checks and self-review do not establish owner acceptance, live-provider acceptance, deployment, or release readiness. Equipment eligibility and the shared identifier guarantee still require team agreement before affected acceptance can be completed.
