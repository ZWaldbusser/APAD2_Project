# Overview and insights review (#14)

This is the bounded frontend refresh of the existing **Integration** page.
It preserves the merged vendor comparison, budget estimates and watchlist.
`/visualization` still redirects to `/integration`. It introduces no new backend
contract, data ingestion, storage or provider writes.

## Running comparisons

- Before: <http://127.0.0.1:5057/integration>, main `5228801`.
- After, normal services: <http://127.0.0.1:5058/integration>.
- After, **labelled analytics sample only**: <http://127.0.0.1:5059/integration>.

These links work only on Rohan's laptop. Sign in separately on each port using
an authorized account and its authenticator. This branch starts from main, so
its login screens do not include the separate pending auth refresh in #30.

Both normal previews use real clients. No aggregate summary adapter is confirmed
on this baseline, so **Summary metrics unavailable** is an expected outcome.
The sample preview enables only the existing optional summary fixture. Its
authentication, Projects, Hardware and vendor clients still use real services.
Its figures and pipeline rows are examples, not verified inventory or agency data.

## Owner checks

1. Compare Integration before and after. After uses the Civic Orange workspace
   with clear summary, shared-stock, agency-insight and data-health sections.
   An unavailable summary must not become zero-valued cards or an empty inventory.
2. Click **Refresh summary** in the normal After. It performs another summary
   read, disables the button while pending and reports the result. A failed
   initial read remains unavailable; it does not claim a successful refresh.
3. Open the labelled sample preview. Confirm its sample notice, example metrics
   and shared-stock label. Example capacity 100 and availability 80 means
   20 checked out. **Reload sample** reloads the fixture without claiming live
   provider freshness. Source timestamp remains **Not provided**; browser load
   time is separately labelled.
4. Use **Go to vendor comparison**. Select a joined project, hardware and
   quantity, then use the existing comparison flow. Refreshing only the summary
   must preserve the vendor selections and results. Watchlist writes retain
   their existing real behavior; use only team-approved test changes.
5. Repeat at roughly 375px width and with Tab/Shift+Tab/Enter. Content should fit
   without horizontal scrolling. Stock counts and source status have text labels,
   so their meaning does not rely on orange bars or color.

Explore freely after these checks. Report the preview, action and visible result.
The unavailable agency comparison is intentional: no named foreign-agency data,
guessed agency totals or invented all-agency average is displayed.

## Automated scenarios and remaining gates

Isolated tests cover genuine zero versus missing values, invalid rows/counts and
dates, empty responses, whole-source outages, accessible stock meters, pending
refresh protection and last-good response retention after refresh failure. A
retained response stays explicitly marked as earlier data with its original source
timestamp. It is held only in page memory, not a new stored snapshot or pipeline.
Browser-only request fixtures exercise these states on desktop and phone.

Run `npm test --prefix client -- --maxWorkers=2`, `npm run build --prefix client`
and the repository lint command. Baseline lint failures and the large-bundle
warning are recorded separately on the PR. No backend source changes are made.

Live aggregate delivery, safe own-agency/all-agency comparison, stored history,
provider freshness and validated/rejected-record reporting still need the data
owners' accepted contract and observed results. This PR does not close those gates.

## Reproduce on another machine

Fetch the repository and create separate checkouts:

```powershell
git fetch origin
git worktree add --detach ../apad2-insights-before 5228801fe7597c50497ae64ceb61455057ca1023
git worktree add --detach ../apad2-insights-after origin/codex/14-civic-orange-insights
```

In each checkout, follow the README for a private `.env` and Python dependencies,
then run `npm ci --prefix client`. Leave `VITE_API_BASE_URL` empty for same-origin
previews. Run `npm run build --prefix client`, then start Flask in separate terminals:

```powershell
# Before checkout
python -m flask --app server/app.py run --host 127.0.0.1 --port 5057
# After checkout
python -m flask --app server/app.py run --host 127.0.0.1 --port 5058
```

For an optional sample comparison, use separate checkouts or stop the normal
server before rebuilding: set `VITE_USE_VISUALIZATION_MOCKS=true` for the build,
then restart Flask. This enables only labelled summary examples in either revision.
Remove the flag and rebuild to return to the normal summary client. Never commit
the private `.env`; credentials have no `VITE_` prefix.
