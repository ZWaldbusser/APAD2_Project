# Hardware rental project

React frontend with a Flask backend that integrates local MongoDB user accounts,
the Projects REST API, and the Hardware gRPC API.

## Run locally

1. Copy `.env.example` to `.env` and configure `MONGO_URI`, `JWT_SECRET_KEY`,
   `PROJECTS_API_BASE_URL`, `HARDWARE_API_BASE_URL_grpc`, and `HARDWARE_API_KEY`.
2. Install dependencies: `npm install`, `npm install --prefix client`, and
   `python -m pip install -r server/requirements.txt`.
3. Run `npm run dev` from the repository root.

Vite reads the root `.env`. `VITE_API_BASE_URL` points to Flask (locally
`http://127.0.0.1:5050`). In production, leave it empty for same-origin requests.
Rebuild after changing Vite variables. Live services are the default;
`VITE_USE_MOCKS=true` explicitly enables the development mocks.

## Service boundaries

- `client/src/services/http.js`: shared browser HTTP/session transport.
- `client/src/services/projects.js`: Projects API operations.
- `client/src/services/hardware.js`: inventory, allocations, retry orchestration,
  and joined allocation/catalog data for project details and resource rental.
- `client/src/services/users.js`: local MongoDB user authentication.
- `server/app.py`: Flask entry point, users, authentication, and hardware routes.
- `server/routes/projects.py`: authenticated Projects API routes under
  `/api/projects-service`, separate from React's `/projects/...` navigation.
- `server/services/projects.py`: server-to-server REST transport using
  `PROJECTS_API_BASE_URL`; forwards API status codes and JSON bodies.
- `server/hardwareDatabase.py`: hardware application operations and response mapping.
- `server/hardware/client.py`: working gRPC transport and checkout lookup logic.
- `server/hardware/hardware.proto` and generated bindings: hardware wire contract.
- `server/usersDatabase.py` and `server/db.py`: MongoDB user persistence.

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
Check-in reads all outstanding checkouts for the authenticated MongoDB user before
returning units. An excessive return is rejected before any writes. A return across
multiple checkout records uses multiple RPCs; if a later RPC fails, the client
reloads the allocations to show earlier completed returns.

Agency is carried from project creation/dashboard into hardware writes for remote
project validation. Hardware `project_id` continues to use the existing plain
project ID. The Projects contract allows identical IDs across agencies, while the
hardware contract has no agency field: use globally unique project IDs until the
teams agree on a shared namespaced identifier (the contract proposes
`orgId:projectId`). Changing that convention requires migrating existing allocations.

## Hardware gRPC configuration

`HARDWARE_API_BASE_URL_grpc` is a service host without `/api`. HTTPS and bare
`host:port` targets use TLS; `http://localhost:50051` is plaintext for local tests.
`HARDWARE_API_KEY` and `HARDWARE_API_TEAM` (default `front-end`) are sent as Basic
authorization metadata and stay on the server. All hardware calls use gRPC;
`HARDWARE_API_BASE_URL` and old browser proxy URLs are not used.

`HARDWARE_API_TIMEOUT_SECONDS` and `PROJECTS_API_TIMEOUT_SECONDS` default to 10.
Hardware mutations have unique request IDs; a transient `UNAVAILABLE` retry reuses
the same ID within the original deadline. Version conflicts return HTTP 409.
Project mutations are not automatically retried.

Regenerate bindings after changing the proto:

```powershell
python -m pip install -r server/requirements-dev.txt
python -m grpc_tools.protoc -I server --python_out=server --grpc_python_out=server server/hardware/hardware.proto
```

## Verification

```powershell
python -m unittest discover -s server/tests
npm run build --prefix client
npm run lint --prefix client
```

Backend tests use an in-process gRPC server and mocked Projects REST responses;
they do not create live projects or reservations.

## Heroku deployment

Use Node.js then Python buildpacks. Configure the same server environment variables
as local development, and leave `VITE_API_BASE_URL` empty. The root
`heroku-postbuild` script builds React; the included `Procfile` starts
`gunicorn server.app:app`, which serves Flask and `client/dist` together.
`/api/health/db` checks the MongoDB connection.
