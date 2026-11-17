# React Client

## Direction D workspace

Use the official UT tokens in `src/styles/Workspace.css`: orange `#BF5700` and white `#FFFFFF`, with pure-white workspace surfaces. Direction A remains independent and unchanged.

## Current runtime: confirmed APIs

Users/MFA, Projects and Hardware always call the existing Flask adapters. Their browser mock routes, demo identities, seeded project/hardware databases and Review scenario controls have been removed. `VITE_USE_MOCKS` and `VITE_MOCK_DELAY_MS` no longer select app behavior. No fake service response is used when a confirmed API is unavailable.

From the repository root, follow the [root setup guide](../README.md): create a private root `.env` and configure the provider targets/key, install Python/server and Node/client dependencies, then run `npm run dev` to start Flask and Vite. A frontend-only server does not supply the adapters. The Vite `/api` proxy defaults to `http://127.0.0.1:5050`; `VITE_API_BASE_URL` must name Flask, not the upstream Projects/Hardware service. Keep secrets out of `VITE_*` variables and Git.

Use a real Users account and real MFA. The former `demo/demo` login, placeholder QR and arbitrary `123456` code are retired. Sign out of an old sample session before using live mode; old mock tokens cannot authenticate with the real Users service. Registration, MFA verification, project creation and allocation now reach the configured services.

## Unconfirmed Overview aggregate

There is no confirmed aggregate backend route on this branch for `/api/visualization`. Without a real source, Overview reports unavailable. Set `VITE_VISUALIZATION_URL` only when the data team supplies the aggregate endpoint/contract.

For presentation work only, `VITE_USE_VISUALIZATION_MOCKS=true` enables an isolated **Sample Overview**, labelled as example figures. It has no fake Users/Projects/Hardware endpoints or provider freshness timestamp. All authentication and domain operations remain real even with this option enabled. It is off by default.

## Create-project owner check

Use a team-approved test account/project environment: the following actions now create real provider records.

1. Sign in using the supplied Users/MFA flow and open Projects → Create project. Required labels carry red asterisks. Empty/invalid fields receive an error summary and inline feedback.
2. Create an agreed test project with a required description, valid budget and no hardware. Verify confirmation and View project using the verified account agency and project identifier and canonical creator ID.
3. Where the test environment permits allocation writes, choose valid quantities from live unallocated stock and verify the created project's actual Hardware allocations. Failure recovery remains implemented; do not deliberately disrupt a shared provider to demonstrate it. Automated fixtures cover partial failure, remaining-only retry and duplicate-submit protection.
4. Check keyboard focus, error links, phone layout and cancel behavior, then explore freely. Whole-dollar budgets match the supplied contract. Agency is now a fixed verified-account field under the owner-approved temporary agency-only rule.

The former sample-data URLs, demo credentials and Review scenario walkthrough were historical evidence for earlier revisions; they no longer provide a live acceptance check. PR #23 records the accepted functional baseline and the subsequent mock-retirement revision. A before/after comparison now requires configured services and approved test data; frontend-only previews cannot establish provider acceptance.

## Verification

```powershell
npm ci --prefix client
npm test --prefix client
npm run build --prefix client
npm run lint --prefix client
```

UI/router/service-client tests retain isolated responses at the HTTP boundary and never create provider records. New routing checks verify that legacy mock settings cannot intercept confirmed API calls. Tests of the retired fake backend/scenario router were removed with that implementation; the create, browse, MFA, transport and Overview-label behavior tests remain.

Full lint has two existing errors in AuthContext.jsx and AuthEntryPage.jsx. Runtime endpoint contracts and passing automated checks are separate from real credentials, live-provider acceptance and release readiness. Global project-ID/Hardware agency scoping, allocation ownership and other partner decisions remain in the existing tracker; no partner service is modified. This prerequisite correction enforces the owner-approved temporary verified-agency-only rule in our adapter.

## Supplied notification integration

Merged PR #22 places its notification component in the workspace header, and the component still imports `USE_MOCKS`. A compatibility export fixed to `false` keeps that import valid; it is not an environment-controlled mode and enables no app mocks. Preserve that Inbox wiring when reconciling the shared layout changes. Secure subscriber identity/live delivery remain separate verification gates. This branch does not change the supplied notification code or establish secure live Inbox acceptance.

## Projects contract and identity prerequisite repair

The browser API paths remain unchanged; Flask now uses the supplied Projects v0.2
bindings. `searchProjects({ userId })` requests membership filtering, and the backend
binds it to the validated user rather than permitting another user's ID. Responses
preserve string `joined_users` IDs. This adds the capability for #12 without shipping
its My Projects/join-leave refresh or claiming secure Inbox delivery is complete.

Create and join show the account agency as read-only. Foreign project context is
rejected by the backend with 403 even if a caller changes a request manually. The
Hardware path requires a verified agency project and refuses known ambiguous IDs
with 409 pending a cross-service naming/migration agreement. No namespaces are
silently introduced and no existing allocations are migrated.

For a safe review, inspect the fixed agency fields and run the backend integration
tests. They exercise invalid actor/agency attempts and create/allocate/read through
loopback Users/Projects/Hardware providers without modifying live records. A live
provider outage must remain an unavailable state; these tests do not establish
hosted acceptance. See the linked PR for its current revision and live limitations.
