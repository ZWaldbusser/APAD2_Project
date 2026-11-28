# Live-first read fallback

The edge node is a software layer in Flask. It stores validated read snapshots in
MongoDB, not a complete database backup. Every covered read calls its live provider
first unless that service's circuit is open. A successful response refreshes the
matching snapshot. There is no background sync, browser offline cache or write queue.

| Read | Maximum snapshot age |
| --- | --- |
| Hardware catalog | 24 hours |
| Allocations | 1 hour |
| Project details and searches | 6 hours |

Keys hash the schema version, service, endpoint kind, verified agency (or public
catalog scope), and the complete request parameters. Different searches and pages
need their own successful request before fallback is possible. Identity and agency
checks run before protected snapshot lookups. Membership searches include the
verified user filter. Existing server-side tenant restrictions remain in place;
including a tenant in a key alone would not authorize access.

Whole responses are validated and fields allowlisted before returning or saving.
Malformed or unexpected-agency responses are rejected as a whole. Availability
errors (HTTP 5xx), response-validation failures, and open circuits can use matching
unexpired snapshots. HTTP 4xx responses never use snapshots. MongoDB TTL cleanup
removes expired records eventually; application checks reject them immediately.
The default payload limit is 1 MiB; larger valid live responses are returned but
not saved. The in-memory store holds at most 256 snapshots per process.

Responses include `meta.source` (`live` or `cache`) and `meta.stale` (true for cache).
Cached responses also include UTC `savedAt` and `expiresAt`. The browser displays a
saved-data banner with the oldest saved time. Freshness is tracked by service,
path and request body: refreshing one page does not hide another page's warning.
Warnings clear when matching requests return live data, the page reloads, or the
user signs in/out. Only freshness metadata is held in browser memory.

## Configuration

Set these server-side environment variables, then restart Flask. Never prefix
credentials with `VITE_` or commit private `.env` files.

```dotenv
EDGE_STORE=auto
# Uses MONGO_URI when EDGE_MONGO_URI is omitted.
EDGE_MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/
EDGE_MONGO_DATABASE=Haas_db
```

The collection is `edge_snapshots`. The MongoDB account must be able to ping,
read/write that collection and create its `expiresAt` TTL index. Use the deployment's
TLS settings and normal MongoDB network access restrictions. Mongo operations have
a two-second overall timeout and shorter connection/selection/socket limits.

| Mode | Startup behavior |
| --- | --- |
| `auto` (default) | Select Mongo after successful ping and index creation; otherwise select an empty memory store |
| `mongo` | Select Mongo after successful initialization; otherwise disable snapshots |
| `memory` | Select a bounded, volatile per-process memory store |
| `off` | Disable snapshot storage and fallback |

The chosen store stays fixed until restart. Mongo is never mirrored into memory,
and a later Mongo outage does not switch stores. Successful live reads still return
when snapshot writes fail. Mongo snapshots survive Flask restarts. Memory snapshots,
circuit state and metrics do not; each Gunicorn worker has independent process state.

After three consecutive eligible read failures, the service circuit opens for 30
seconds. Covered reads use snapshots or return an error during that interval. A
subsequent successful live read closes the circuit. Writes always contact live
services and do not consult this breaker or snapshot layer.

`GET /api/health` returns the selected store, initialization-failure flag, process
counters and circuit state. Its HTTP 200 and top-level `status: ok` mean Flask is
running; they do not establish that Mongo, Users or upstream providers are healthy.
It does not probe those dependencies or reveal connection strings.

## Failure boundaries

| Failure | Behavior |
| --- | --- |
| Hardware or Projects unavailable | Covered reads can use previous unexpired matching snapshots; failed writes are not queued |
| Users unavailable | Protected reads fail during token validation, before snapshot access |
| All cloud connectivity lost | Cloud Mongo and Users are unreachable; no offline continuity |
| Browser cannot reach Flask or Flask is down | No new API responses and no browser offline cache |
| Mongo unavailable, providers healthy | Live reads continue; snapshot operations fail and increment counters |
| Flask restarts | Mongo snapshots survive; memory snapshots, metrics and circuits reset |

Authentication, MFA, profiles, pricing, budget context, vendor rankings and Overview
are excluded. Checkout, return, reservation, project and membership writes remain
live-only, including their existing live project/agency checks. The catalog remains
public as before; protected allocation snapshots are partitioned by verified agency.
An allocation snapshot includes the result of its prior successful live project
and duplicate-ID checks; those dependencies may be unavailable during fallback.
Saved inventory and membership information can differ from current provider state.

This fallback improves availability and identifies freshness. It does not reduce
normal upstream calls or provide a separately deployed local edge device.

## Verification

```powershell
$env:EDGE_STORE = 'off'
python -m unittest discover -s server/tests
npm test --prefix client
npm run build --prefix client
npm run lint --prefix client
```

Tests cover TTL query construction, expiry before cleanup, bounded payloads,
parameter and agency isolation, validation failures, store failures, circuits,
live-only writes and authentication before fallback. Mongo driver calls are mocked;
Atlas reachability must also be checked in the deployment environment.

Driver references: [MongoDB connection options](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/connect/connection-options/)
and [operation timeouts](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/connect/connection-options/csot/).
