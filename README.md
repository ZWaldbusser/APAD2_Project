# Hardware rental project

React frontend with Flask adapters for the Users/MFA gRPC service,
the Projects gRPC API, and the Hardware gRPC API.

## Run locally

1. Create a private root `.env`. Confirm `PROJECTS_GRPC_TARGET`,
   `USERS_GRPC_TARGET`, `HARDWARE_API_BASE_URL_grpc`, `HARDWARE_API_KEY`,
   and `HARDWARE_API_TEAM` with their owners. Projects requires an explicit target;
   Users retains its documented default. Hardware host/key must be supplied privately.
   Keep all provider credentials server-side without a `VITE_` prefix. The repository
   does not currently include an `.env.example`; never commit your `.env`.
2. Install dependencies: `npm install`, `npm install --prefix client`, and
   `python -m pip install -r server/requirements.txt`.
3. Run `npm run dev` from the repository root.

Vite reads the root `.env`. `VITE_API_BASE_URL` points to Flask (locally
`http://127.0.0.1:5050`). In production, leave it empty for same-origin requests.
Restart Vite/rebuild after changing Vite variables. Users/MFA, Projects and Hardware
always use real adapters: their browser mocks, demo accounts and review-scenario
controls have been removed. Old `VITE_USE_MOCKS`/`VITE_MOCK_DELAY_MS` settings are
ignored. Real sign-in and MFA are required; `demo/demo` and arbitrary six-digit
codes are no longer review credentials.

The Overview aggregate is still unconfirmed on this branch; there is no matching
Flask `/api/visualization` route. Its normal client reports unavailable when no
real source is configured. `VITE_USE_VISUALIZATION_MOCKS=true` explicitly enables
only a labelled **Sample Overview**. It never intercepts authentication, project
or hardware calls and does not supply verified agency/inventory figures.

| Browser API (Flask) | Upstream contract | Configuration |
| --- | --- | --- |
| `/api/users-service/*` | Users/MFA gRPC | `USERS_GRPC_TARGET` (default in `server/users/client.py`) |
| `/api/projects-service/*` | Projects gRPC, supplied proto v0.2 | `PROJECTS_GRPC_TARGET` |
| POST `/api/hardware`, `/api/listAllocations` and existing hardware write routes | Hardware gRPC | `HARDWARE_API_BASE_URL_grpc`, `HARDWARE_API_KEY`, `HARDWARE_API_TEAM` |

The active Projects contract is `server/projects/projects.proto` v0.2.
The older tracked Projects v1.4 document and `server/services/projects.py` are
legacy references; the running Flask adapter uses `server/projects/client.py`.
Hardware's active transport is documented in `server/hardware/hardware.proto`,
`server/hardware/hardware_openapi.yaml` and the gRPC adapter. The root `hardware.yaml`
describes a different REST/session interface; it is not the browser's current transport.
Endpoint contracts do not prove credentials, reachability or end-to-end acceptance.

## Service boundaries

- `client/src/services/http.js`: shared browser HTTP/session transport.
- `client/src/services/projects.js`: Projects API operations.
- `client/src/services/hardware.js`: inventory, allocations, retry orchestration,
  and joined allocation/catalog data for project details and resource rental.
- `client/src/services/users.js`: Users-service registration/login/MFA/profile client.
- `server/app.py`: Flask entry point, users, authentication, and hardware routes.
- `server/routes/projects.py`: authenticated Projects API routes under
  `/api/projects-service`, separate from React's `/projects/...` navigation.
- `server/projects/client.py`: Projects gRPC transport using `PROJECTS_GRPC_TARGET`;
  maps camelCase browser requests into protobuf messages and back to JSON.
- `server/projects/projects.proto`: supplied v0.2 schema and generated bindings.
  Search supports optional `userId` and returns `joined_users` in each summary.
- `server/hardwareDatabase.py`: hardware application operations and response mapping.
- `server/hardware/client.py`: working gRPC transport and checkout lookup logic.
- `server/hardware/hardware.proto` and generated bindings: hardware wire contract.
- `server/users/client.py`: Users gRPC transport and access-token validation.
- `server/usersDatabase.py` and `server/db.py`: retained legacy persistence files;
  the current authentication path uses the Users service.

`server/projectsDatabase.py` is retained as legacy code and is not used by the
application. Project creation, search, details, membership, and price-context
requests all use the Projects API. Hardware operations validate projects there,
so projects do not need a duplicate local MongoDB record.

## Project and hardware synchronization

Create sends the project and its planned `hardwareList` (`hardwareId`,
`allocation`) to the Projects API, then reserves the selected quantities through
Flask's gRPC bridge. Allocation versions come from the latest inventory. Successful
allocations are recorded in the form so retries after a partial failure only
process remaining items and never recreate the project. Project fields and planned
quantities are locked after creation. These are separate services, so creation and
allocation are not an atomic transaction; a failed reservation leaves the project
available with a retry message.

The Hardware API owns actual reservations and checkout quantities. Project details
and resource rental read all allocation pages and join them to hardware names.
Remaining project capacity is `quantity - out`; check-in/out refreshes these values.
Check-in reads all outstanding checkouts for the authenticated Users-service ID before
returning units. An excessive return is rejected before any writes. A return across
multiple checkout records uses multiple RPCs; if a later RPC fails, the client
reloads the allocations to show earlier completed returns.

## Trusted identity and agency

Protected requests validate the Users access token. CreateProject's creator ID,
JoinProject/LeaveProject's acting user ID, and an optional membership-search filter
come from that verified identity; browser actor values cannot select another user.
The temporary owner-approved policy restricts project operations to the verified
agency. Omitted agency context is filled server-side; a foreign `orgId` or `org_id`
is rejected with HTTP 403 before contacting Projects or Hardware. The creation and
join forms show a fixed account agency. Unfiltered discovery still lists agency
projects. `/projects` opens My Projects using the canonical current-user filter;
`/projects?view=agency` opens Discover Projects. Both views retain the current search.

## Project membership

Discover a project to open a contextual join review, or enter its ID under Join
project and select Find project. Joining requires a matching agency/project summary
and confirmed membership data; a missing or unavailable record cannot send a join.
Review the project, agency and account before confirming. Leave project on the
detail page also requires confirmation. Cancel/Escape sends no membership write;
pending requests cannot be submitted twice or dismissed. After an uncertain or
rejected write, Refresh membership reads current data before another attempt.
Successful writes reload project or list membership instead of changing it optimistically.

The existing Novu Inbox uses the exact canonical user ID, displays the SDK unread
total, and explains SDK session/list/count failures with a retry. It sends no
membership events: Projects owns notification generation. Browser identity alone
does not establish secure subscriber authorization. Signed subscriber access (or
an agreed equivalent), real creator/member delivery, recipient isolation and no
creator self-event still require integration-owner confirmation and live checks.
Automated fixture checks do not establish those gates or release readiness.

Hardware allocations, checkout and returns first verify the project in the caller's
agency. Allocation reads require a project ID. Because Hardware still stores only
plain project IDs, known cross-agency duplicate IDs are refused with HTTP 409 before
a Hardware call. This is an interim ambiguity check, not a namespacing migration or
an atomic cross-service isolation guarantee. Agree a mapping and existing-record
migration with the service owners before supporting those IDs. Existing equipment
eligibility and allocation-writer ownership are not changed by this repair.

## Equipment checkout and returns

Both Manage equipment entry points open the same project equipment page. Cards
separate project allocation, checked-out units and project-ready units from shared
pool totals, units not checked out and unallocated stock. Shared availability may
include another project's reservations and is not the project's checkout limit.

Check out or Return opens the Civic Orange drawer: enter a positive whole quantity,
review the project/hardware and projected counts, then confirm. Cancel, Back and
Escape send no write. Confirmation is disabled while pending. Provider counts and
the signed-in user's outstanding checkouts are read again after success or an
uncertain failure; a failure never claims success or automatically repeats a write.
Returns are limited to the caller's outstanding quantity, including all provider
pages. Partial multi-record returns retain the existing backend behavior.

Two authenticated read mappings reuse the supplied Hardware proto and credentials:

- POST `/api/hardware/checkouts`: requires a project in the verified agency and
  uses the verified Users ID for `ListCheckouts`, ignoring browser actor IDs. It
  returns quantity/returned/outstanding records rather than individual assets.
- POST `/api/hardware/<hardware_id>/availability`: requires the same validated
  project context and maps `GetAvailability`, including optional vendor fields.

When shared stock is exhausted, the page presents supplied vendor alternatives or
an explicit unavailable state. Procurement quantities/prices are not current vendor
stock or an approved-vendor ranking. A failed lookup leaves allocations and other
supported actions usable. Unavailable outstanding records pause returns without
pretending the caller has zero outstanding units.

The existing checkout/return writes, idempotency and verified-agency enforcement
remain in use. The team's equipment-actor policy and permanent project/agency ID
mapping still need agreement; this frontend does not introduce a membership-only
or agency-wide eligibility rule. Provider write permissions, real checkout/return
and out-of-stock vendor delivery require approved live test data. Isolated test
fixtures do not establish that acceptance.

## Projects gRPC configuration

`PROJECTS_GRPC_TARGET` is a required host/port or service URL without a path. The supplied
service currently uses plaintext HTTP/2; a bare host/port selects that transport.
Use the target supplied by Projects if its deployment address changes. The Flask
adapter validates the user's token and agency because Projects itself does not
authenticate the caller. `PROJECTS_API_BASE_URL` is no longer used by the app.
Read-only RPCs may retry transient unavailability within their deadline. Create,
join and leave are not automatically retried.

## Hardware gRPC configuration

`HARDWARE_API_BASE_URL_grpc` is a service host without `/api`. HTTPS and bare
`host:port` targets use TLS; `http://localhost:50051` is plaintext for local tests.
`HARDWARE_API_KEY` and `HARDWARE_API_TEAM` (default `front-end`) are sent as Basic
authorization metadata and stay on the server. All hardware calls use gRPC;
`HARDWARE_API_BASE_URL` and old browser proxy URLs are not used.

`HARDWARE_API_TIMEOUT_SECONDS` defaults to 10 seconds;
`PROJECTS_API_TIMEOUT_SECONDS` defaults to 60 seconds.
Hardware mutations have unique request IDs; a transient `UNAVAILABLE` retry reuses
the same ID within the original deadline. Version conflicts return HTTP 409.
Project mutations are not automatically retried.

Regenerate bindings after changing the proto:

```powershell
python -m pip install -r server/requirements-dev.txt
python -m grpc_tools.protoc -I server --python_out=server --grpc_python_out=server server/hardware/hardware.proto server/projects/projects.proto
```

## Verification

```powershell
python -m unittest discover -s server/tests
npm run build --prefix client
npm run lint --prefix client
```

Backend tests use loopback Users/Projects/Hardware gRPC providers and isolated
external-boundary responses. They exercise real protobuf serialization without
creating live accounts, projects or reservations.

## Heroku deployment

Use Node.js then Python buildpacks. Configure the same server environment variables
as local development, and leave `VITE_API_BASE_URL` empty. The root
`heroku-postbuild` script builds React; the included `Procfile` starts
`gunicorn server.app:app`, which serves Flask and `client/dist` together.
The current app does not expose a MongoDB health-check route. A successful page load
alone does not verify upstream data services; check their read-only adapter requests.
