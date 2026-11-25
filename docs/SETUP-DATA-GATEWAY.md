# Data gateway: setup and verification

The current architecture and outage matrix are documented in the root README.

## Configuration

Set these in the project root `.env` (never commit credentials):

```dotenv
MONGO_URI=mongodb+srv://<encoded-user>:<encoded-password>@<cluster>/?retryWrites=true&w=majority
EDGE_DB=edge_store
EDGE_COLLECTION=edge_snapshots
EDGE_STORE=auto
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
PROJECTS_GRPC_TARGET=https://<projects-host>:443
USERS_GRPC_TARGET=https://<users-host>:443
HARDWARE_API_BASE_URL_grpc=https://<hardware-host>:443
HARDWARE_API_KEY=<team-secret>
HARDWARE_API_TEAM=front-end
```

Use the team-provided service endpoints. `USERS_GRPC_API_BASE_URL` and
`PROJECTS_API_BASE_URL` are not read by the active adapters. Real environment
variables take precedence over `.env`. Restart Flask after changing settings.

MongoDB needs permission to read/write the configured snapshot collection and create
its `expiresAt` TTL index. Scope credentials to that database. `EDGE_DB` defaults to
`Haas_db` if omitted; it is explicitly set to `edge_store` in this local setup.
The active client is `server/edge/mongo.py`; archived local-account persistence uses a
separate legacy module which is never imported by the application.

```powershell
python -m pip install -r requirements.txt
python -m pip install -r server/requirements-dev.txt
npm install
npm install --prefix client
npm run dev
```

## Verify fallback without changing production data

1. Run `python -m unittest discover -s server/tests`. These tests isolate snapshot
   storage and token validation and use a local Hardware gRPC server. They cover
   live snapshot writes, outage fallback, expiry, request isolation, circuit opening,
   authorization failures, unavailable stores, and live-only writes.
2. Open `/api/health`. Look for `edgeStore.type: MongoStore` and `edgeStore.ok: true`.
   This confirms the store in that process; it is not proof all upstream services work.
3. Browse a real catalog/project page successfully. Atlas should contain snapshots
   with `service`, `endpoint`, `payload`, `fetchedAt`, `expiresAt`, and `sizeBytes`.
4. In a local test instance only, temporarily point Hardware at an unreachable
   endpoint and restart Flask. Keep Atlas and Users reachable. Repeat the exact
   same request (including filters/page). An unexpired MongoDB snapshot should be
   returned with `meta.stale: true` and the saved-data banner.
5. A checkout must still fail during that outage. Restore the real endpoint and
   restart Flask afterward.

Do not use a wrong API key as an outage simulation: upstream 401/403 errors are real
authorization errors and deliberately do not use snapshots.

Default hard age limits: catalog 24h, allocations 1h, projects/searches 6h. Expiry is
checked on reads as well as by the MongoDB TTL index. There is no background warmup
or refresh job. A memory fallback starts empty and disappears on process restart.

## Protobuf generation

```powershell
./scripts/gen_protos.ps1
```

Or use `bash scripts/gen_protos.sh`. Both regenerate all three services from the
checked-in `.proto` files; development dependencies include `grpcio-tools`.
The Projects file still identifies itself as draft v0.1. Generation does not upgrade
it to v0.2 or establish that Hardware matches the November 17 team revision. Obtain
those authoritative contracts, review their changes, then regenerate and test.

## Local inspection on November 17, 2026

MongoDB authentication and collection access passed. The configured
`edge_store.edge_snapshots` collection contained four unexpired snapshots covering
`listHardware`, `listAllocations`, and `searchProjects`, with the TTL index present.
A read-only check returned an existing Atlas snapshot through the fallback function
with `meta.stale: true`. This was a simulated service failure, not a physical network
outage or an end-to-end authentication test. Counts change as snapshots expire.

## Remaining architecture limits

- Atlas is a cloud dependency, so this setup does not survive a total network loss.
- Protected reads call Users before fallback; Users downtime blocks them.
- Store selection is once per process. Runtime MongoDB failure has no memory mirror.
- Price/budget context, authentication, profiles and Overview have no snapshots.
- HTTP 4xx responses are not masked by cached data.
- The stale banner is advisory, not a mutation lock; writes still attempt live calls.
- Cache scoping includes caller-supplied org IDs; tenant authorization still requires review.
- Metrics and circuit breakers are local to each worker, not a shared monitoring system.
