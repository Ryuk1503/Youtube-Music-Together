# Deployment preference

The user requests that changes to this web app be deployed after verification, without asking for deployment permission again. Deployment is part of completing the task.

Publish the matching frontend as part of deployment and verify it; backend-only uploads do not complete UI changes.

Back up the affected production files, preserve existing data and sessions, and verify the public site after deployment. Do not report deployment as complete if the backend still needs a restart. If required deployment access is unavailable, explain the exact blocker and complete all independent preparation first.

## Restarting the site (alwaysdata API)

Restart rights are granted via an API key stored locally at
`.deploy-local/alwaysdata-api-key.txt` (gitignored; treat like the SSH key).
Restart the site (ID 1077555) with:

```
curl -X POST --basic --user "<API_KEY> account=r1u205:" https://api.alwaysdata.com/v1/site/1077555/restart/
```

A plain `<API_KEY>:` username fails with "Credentials contain invalid related
object" — the `account=r1u205` suffix is required for site resources.
HTTP 204 means the restart was accepted.

**Known quirk (observed 2026-09-24): the first restart can hang.** The old
process receives SIGTERM but keeps serving (its PO-token sidecar dies first,
`sidecarRssMiB` becomes null, the app itself lingers). Always verify the
restart in the site log on the SSH host
(`~/admin/logs/sites/2026/sites-<YYYY-MM-DD>.log`, dates in Paris time —
late-evening ICT restarts land in the previous day's file): look for
`Upstream starting`, `Server running`, and a fresh `[pot:provider]`
heartbeat with a new PID after the SIGTERM line. If the old PID is still
heartbeating about a minute after the SIGTERM, POST the restart again — the
second call completes the cycle (old process exits, new one starts).

Do not report deployment as complete until the new process is confirmed
running in the log and the public site (https://r1u205.alwaysdata.net/)
responds normally.
