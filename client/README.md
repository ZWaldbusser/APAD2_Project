# React Client

## Direction D workspace

The project browsing slice uses the official UT digital brand tokens in `src/styles/Workspace.css`: `--brand-orange: #BF5700` and `--brand-white: #FFFFFF`. Keep main workspace surfaces pure white and reuse these tokens in subsequent increments. Neutral text/borders provide contrast. The earlier Direction A prototype is independent and unchanged.

Run `npm ci` and `npm run dev` from `client/`. The existing Vite configuration reads environment files from the repository root. Mock mode is enabled unless `VITE_USE_MOCKS=false`.

For the local project-browsing review, sign in as `demo` / `demo` and open `/projects`. The project seed data is unchanged from the baseline; explicit agency metadata has been added to mock profiles. `teammate` / `teammate` demonstrates Dallas, `empty` / `demo` an empty Texas agency, and `unassigned` / `demo` a missing agency. The sample banner labels this data. In development mock mode, its **Review scenario** selector provides a standard list, empty list, service outage, and missing detail. Selection reloads the page, persists only in that tab's session storage, and can be restored to Standard data. It does not intercept live service requests and is absent from production builds.

Use the following review journey:

1. Search by project name and ID. Open a project, then use Back to projects; the search is retained.
2. Repeat with the keyboard and at phone width; the menu supports Enter and Escape.
3. Exercise empty and unavailable scenarios. The missing-detail scenario keeps the list available so you can open a result and see the not-found state.
4. Explore the rest of the workspace freely. Creation, joining/leaving, equipment transactions, overview, and account redesign remain later increments; their existing routes are retained.

Run `npm test`, `npm run build`, and `npm run lint`. Behavior tests replace the HTTP service boundary while exercising the real router, service clients, and UI.

The current live `/api/me` response has no agency field. Browsing therefore shows Agency unavailable until the Users integration supplies a supported `agencyCode` (or `agency_code`) and canonical `id` (or `user_id`). The UI never substitutes Austin or uses the legacy dev-user bypass as verified identity. Project list responses do not establish membership; details use `joined_users` and retain the existing membership gate. UI filtering and fixtures do not establish server authorization, provider acceptance, or deployment readiness.
