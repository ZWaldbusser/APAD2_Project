# React Client

## Direction D workspace

Use the official UT tokens in `src/styles/Workspace.css`: orange `#BF5700` and white `#FFFFFF`, with pure-white workspace surfaces. Direction A remains independent and unchanged.

## Current runtime: confirmed APIs

Users/MFA, Projects and Hardware always call the existing Flask adapters. Their browser mock routes, demo identities, seeded project/hardware databases and Review scenario controls have been removed. `VITE_USE_MOCKS` and `VITE_MOCK_DELAY_MS` no longer select app behavior. No fake service response is used when a confirmed API is unavailable.

From the repository root, follow the [root setup guide](../README.md): copy `.env.example` to your private `.env`, configure the provider URLs/key, install Python/server and Node/client dependencies, then run `npm run dev` to start Flask and Vite. A frontend-only server does not supply the adapters. The Vite `/api` proxy defaults to `http://127.0.0.1:5050`; `VITE_API_BASE_URL` must name Flask, not the upstream Projects/Hardware service. Keep secrets out of `VITE_*` variables and Git.

Use a real Users account and real MFA. The former `demo/demo` login, placeholder QR and arbitrary `123456` code are retired. Sign out of an old sample session before using live mode; old mock tokens cannot authenticate with the real Users service. Registration, MFA verification, project creation and allocation now reach the configured services.

## Unconfirmed Overview aggregate

There is no confirmed aggregate backend route on this branch for `/api/visualization`. Without a real source, Overview reports unavailable. Set `VITE_VISUALIZATION_URL` only when the data team supplies the aggregate endpoint/contract.

For presentation work only, `VITE_USE_VISUALIZATION_MOCKS=true` enables an isolated **Sample Overview**, labelled as example figures. It has no fake Users/Projects/Hardware endpoints or provider freshness timestamp. All authentication and domain operations remain real even with this option enabled. It is off by default.

## Create-project owner check

Use a team-approved test account/project environment: the following actions now create real provider records.

1. Sign in using the supplied Users/MFA flow and open Projects → Create project. Required labels carry red asterisks. Empty/invalid fields receive an error summary and inline feedback.
2. Create an agreed test project with a required description, valid budget and no hardware. Verify confirmation and View project using the selected agency/project identifiers and canonical creator ID.
3. Where the test environment permits allocation writes, choose valid quantities from live unallocated stock and verify the created project's actual Hardware allocations. Failure recovery remains implemented; do not deliberately disrupt a shared provider to demonstrate it. Automated fixtures cover partial failure, remaining-only retry and duplicate-submit protection.
4. Check keyboard focus, error links, phone layout and cancel behavior, then explore freely. Initial whole-dollar budget validation and agency selection are preserved pending their existing team decisions.

The former sample-data URLs, demo credentials and Review scenario walkthrough were historical evidence for earlier revisions; they no longer provide a live acceptance check. PR #23 records the accepted functional baseline and the subsequent mock-retirement revision. A before/after comparison now requires configured services and approved test data; frontend-only previews cannot establish provider acceptance.

## Verification

```powershell
npm ci --prefix client
npm test --prefix client
npm run build --prefix client
npm run lint --prefix client
```

UI/router/service-client tests retain isolated responses at the HTTP boundary and never create provider records. New routing checks verify that legacy mock settings cannot intercept confirmed API calls. Tests of the retired fake backend/scenario router were removed with that implementation; the create, browse, MFA, transport and Overview-label behavior tests remain.

Full lint has two existing errors in AuthContext.jsx and AuthEntryPage.jsx. Runtime endpoint contracts and passing automated checks are separate from real credentials, live-provider acceptance and release readiness. Global project-ID/Hardware agency scoping, allocation ownership and other partner decisions remain in the existing tracker; no backend policy or partner-service implementation is added by this correction.

## Pending notification integration

PR #22 now places its notification component in the workspace header, and the component still imports `USE_MOCKS`. A compatibility export fixed to `false` keeps that import valid; it is not an environment-controlled mode and enables no app mocks. Preserve that Inbox wiring when reconciling the shared layout changes. Secure subscriber identity/live delivery remain separate verification gates. This branch does not change a teammate's notification code or declare that integration accepted.
