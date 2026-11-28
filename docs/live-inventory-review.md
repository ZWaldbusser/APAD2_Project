# Live shared inventory (#14)

Integration now reads shared Hardware pools through the existing ListHardware
adapter, independently of the unconnected reporting-summary source. Each pool
shows its name, category, status, total, available, reserved, checked-out and
unallocated units. These are shared counts across agencies.

Available is total minus checked out; it includes units reserved for projects.
Reserved includes checked-out units. Unallocated is total minus reserved.
These figures do not establish an individual project's allocation or permissions.

## Before and after

- Before: http://127.0.0.1:5074/integration — #31 head `b4c8056`.
- After: http://127.0.0.1:5075/integration — `codex/14-live-shared-inventory`.

These are local to the laptop running them. Both normal previews require real
authorized login and MFA and use configured service adapters. The optional
analytics sample remains limited to its labelled summary; it does not supply the
new live inventory panel.

Teammates can check out the before revision or after branch, follow README's
private dependency/environment setup, leave `VITE_API_BASE_URL` empty for
same-origin serving, and build with `npm run build --prefix client`. From that
worktree's root, with the private environment loaded, run:

```powershell
python -m flask --app server/app.py run --host 127.0.0.1 --port 5075
```

Use 5074 for Before. Keep credentials in the private environment, outside Git.

## Short owner check

1. Sign in to After and open Integration. Shared hardware pools should have real
   counts even while the separate summary reports unavailable. Confirm available,
   reserved, checked-out and unallocated quantities are labelled distinctly.
2. Click Refresh inventory. It disables while loading and announces the result.
   Browser receipt time changes only after a successful complete read. The source
   timestamp remains Not provided; this is not a claimed ingestion refresh.
3. Select a project and hardware item in the existing vendor form. Refresh
   inventory again; the vendor selections and any existing results should stay.
4. Repeat with keyboard and at phone width. Explore freely; no membership,
   allocation or checkout write is part of this inventory test.

Before has no live inventory panel. The ordinary aggregate summary, vendor
comparison and watchlist remain supplied by #31 and the previously merged work.

## Data and failure handling

- All pages must complete consistently before replacing the displayed response.
  A truncated, failed or inconsistent collection is unavailable, not smaller stock.
- Missing, unsafe or inconsistent counts, unsupported status/required fields and
  duplicate IDs are withheld from display. Remaining records stay visible with
  the withheld count. No usable rows is different from a genuinely empty list.
- An initial outage shows no counts. A failed refresh retains the last successful
  response in page memory, explicitly marked as earlier, with its original receipt
  time. There is no stored snapshot, ingestion run, polling or source-age claim.
- Browser tests use isolated HTTP fixtures for outages and invalid data. They do
  not add runtime application mocks or prove provider/security acceptance.

Review this follow-up after #31. It does not depend on #27/#28/#30/#32. Agency
allocation mapping, shortages from GetAvailability, reporting aggregates,
history/comparison, conditional price/spend and validated load health retain
their separate contracts/decisions. No backend service or data pipeline is added.
