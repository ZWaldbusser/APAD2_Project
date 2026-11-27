# Membership refresh follow-up (#12 / PR #27)

After a confirmed join or leave, the app immediately reads the signed-in user's
projects in their verified agency before following the existing navigation. The
dialog stays pending during that read. A failed or inconsistent list response
does not undo the saved membership or repeat the write; the destination explains
the refresh failure and provides a read-only recovery path.

## Local comparison

- Before: http://127.0.0.1:5072/projects — PR #27 revision `0cc5687`.
- After: http://127.0.0.1:5073/projects — updated PR #27.

These addresses work only on the laptop running the previews. Both normal
previews use the real configured adapters and require authorized login and MFA.
For another machine, check out the relevant revision, follow the root README's
private configuration/dependency setup, build with `npm run build --prefix client`,
then run Flask from the repository root:

```powershell
python -m flask --app server/app.py run --host 127.0.0.1 --port 5073
```

Use 5072 for Before. Supply the private server environment through your normal
local launcher; do not commit or share credentials. Keep browser API traffic
same-origin.

## Targeted owner check

Use one team-approved test project in your agency that this account can join and
leave. These actions change live membership and may trigger creator notifications.

1. Sign in to After. Open Discover projects and search for the test project.
2. Join it once. Confirm the details show membership, then open My projects and
   verify it is listed without reloading or signing in again.
3. Open its details and leave. Confirm it disappears from My projects; the search
   remains saved. Discover still lists the project and offers Join project.
4. Join the same project again in this session. Verify it returns to My projects
   and its details are available. Explore with keyboard and at phone width.

Repeat on Before if useful. The ordinary cycle may already work there; this
follow-up makes the current-user list read immediate and adds regression coverage.
Automated HTTP-boundary fixtures verify read ordering, pending protection, and
read-failure recovery without requiring you to cause live outages. Fixtures are
isolated tests, not runtime app mocks or proof of provider delivery.

The review/landing order remains #32 → #27 → #28. Secure notification subscriber
authorization, real delivery/isolation, equipment policy/mapping, and release
acceptance remain separate. No backend service or notification sender is added.
