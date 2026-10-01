# UniPlanner MCP setup

UniPlanner implements planner tools plus website-only enrollment and local revocation. It uses the official MCP SDK's stateless Streamable HTTP transport in the existing backend. MCP is disabled by default. There has been no deployment or real Cloudflare/client verification; this is an operator preparation guide, not a claim that a client connection already works.

See the [capability matrix](mcp-capabilities.md) for scope and the [security record](mcp-security.md) for tests and remaining risks. Planner writes, notifications, export, undo and preference synchronization have local implementations; release verification remains pending.

## Configuration

Use private deployment environment configuration. The following values are safe examples, not real infrastructure or credentials:

```dotenv
MCP_ENABLED=false
MCP_WRITES_ENABLED=false
MCP_HOST=mcp.example.com
MCP_PUBLIC_URL=https://mcp.example.com/mcp
WEB_PUBLIC_ORIGIN=https://planner.example.com
CF_ACCESS_ISSUER=https://example-team.cloudflareaccess.com
CF_ACCESS_MCP_AUD=replace-with-mcp-application-audience
CF_ACCESS_WEB_AUD=replace-with-website-application-audience
MCP_ALLOWED_ORIGINS=https://mcp.example.com
```

`MCP_HOST` must equal the hostname part of `MCP_PUBLIC_URL`: lowercase DNS labels, with no scheme, port, path, wildcard or trailing dot. The client container validates it before template rendering. Both Compose variants pass the same value to client and server. Its safe unset default is `mcp-disabled.invalid`. Render only this environment variable in the nginx template; the image's `NGINX_ENVSUBST_FILTER` preserves nginx request variables.

`MCP_PUBLIC_URL` must use HTTPS and the exact `/mcp` path, with no credentials, query, fragment or encoded alternative path. The website and MCP hostnames and Access audiences must differ. Configure `WEB_PUBLIC_ORIGIN` explicitly, including any actual port; do not substitute `CORS_ORIGIN`. Origin comparisons are exact. `MCP_ALLOWED_ORIGINS` is a bounded comma-separated allowlist; start with the MCP origin alone, and add another only after observed client requirements are reviewed. Server-to-server MCP requests without Origin are allowed.

An enabled incomplete configuration fails startup. Disabling MCP does not erase link rows. **Keep `WEB_PUBLIC_ORIGIN` configured while disabled** so an authenticated user can still choose **Disable all agent access**. Status and revocation do not need a functioning JWKS service. Enrollment requires MCP enabled and a valid website Access assertion.

Keep both switches false while preparing infrastructure. Enrollment always includes `planner_read`; users may explicitly add `planner_write`, `notifications` and `export`. The write flag controls mutation discovery/execution, but does not grant permissions. Notification reads require their own grant; notification changes and sends also require the write switch. Export remains available to an authorized export grant with planner writes off. Never auto-expand an existing user's grant as features are added.

## Cloudflare operator preparation

1. Preserve the existing website Access application. Add a dedicated MCP hostname routed through the existing encrypted Tunnel to the nginx container; do not publish the backend port or introduce a direct LAN bypass.
2. Create a distinct Access application for the MCP hostname with Managed OAuth. Use the intended user policy and identity provider; verify that email-code login is actually configured. Do not describe email-code login as phishing-resistant MFA.
3. Configure the exact client callbacks and reviewed grant lifetimes supported by the provider. The starting target is a 15-minute access token and 14-day grant, subject to verified Cloudflare/client support. Record the applied values without credentials. A plain Access email-code rule by itself is not an OAuth integration.
4. Copy the nonsecret issuer and separate application audiences into private environment configuration. Verify that website and MCP assertions for a synthetic test identity contain the same stable `(issuer, sub)`. If subjects differ, stop connection rollout and design a reviewed dual-authenticated pairing flow; do not match email strings.
5. Verify discovery and authorization challenges before enrolling a real planner account. Determine which layer owns protected-resource and authorization-server metadata, resource indicators, client registration, S256 PKCE, token exchange and refresh. The backend currently provides only a generic `WWW-Authenticate: Bearer` challenge on authentication failure. It does not implement an OAuth authorization server or origin discovery documents. nginx permits only `/mcp` on the MCP host. If Managed OAuth requires origin-served discovery paths, add and test those exact paths in a reviewed change; do not route every path to the website.
6. Preserve the website edge cache bypass and service-worker safeguards. MCP responses must never be cached. Keep cloudflared and nginx on the same trusted isolated host/network segment; if the HTTP hop crosses an untrusted network, configure authenticated TLS before release.

Do not overwrite an existing Access application's complete configuration using a partial update. Do not pass OAuth tokens through to unrelated APIs or substitute copied browser cookies, shared service credentials or a homemade OAuth server if Managed OAuth proves incompatible.

The nginx template rejects all other paths on the dedicated MCP hostname before API or SPA routing, including encoded and trailing-slash variants. Exact `/mcp` on the website hostname is rejected. The backend independently checks the actual Host authority and Origin. Keep `TRUST_PROXY_HOPS` matched to the actual deployment chain: the existing project convention is 1 for nginx and 2 for cloudflared → nginx. Verify forwarding rather than blindly changing it. For the direct `cloudflared → client nginx → Express` path set `TRUST_PROXY_HOPS=2` in the deployment environment; both Compose files retain the generic one-hop default. An additional reverse proxy changes the count and must be inspected. Restrict the origin port to trusted ingress: a shorter, directly reachable path can spoof forwarded IPs when configured for two hops. The edge must preserve `X-Forwarded-Proto: https`; cookie Secure follows the forwarded scheme. `COOKIE_SECURE=false` should not be used for the HTTPS deployment.

Tunnel service routing must target the client/nginx port, not the backend. Preserve the public HTTP Host (including an explicit port); leave `httpHostHeader` unset or set it to the correct public authority for each hostname. Rewriting it to an internal host breaks intentional website/MCP isolation. The application remains same-origin and needs no Cloudflare hostname in CORS or CSP.

The client image uses Docker's embedded DNS resolver with a shared dynamic upstream (nginx ≥1.27.3). It starts even when backend DNS is temporarily absent and resolves replacements without restarting nginx. DNS refresh is bounded to five seconds; brief gateway failures during a stopped backend remain possible. Manual `fetch` redirects expose Access expiry without relaxing CSP; non-JSON 401s from Access AJAX requests probe the health endpoint separately from ordinary application JSON 401s. The document/service-worker bootstrap remains uncached and navigations reach Access. Preserve the app-host edge cache bypass; existing stale edge/browser caches may still require the documented purge and browser site-data recovery.

## Enrollment and disabling access

After an authorized isolated rollout, sign into the website through its normal Access gate and application login. Open Account Settings → Agent Connections. Read the scope, enter the current website password in the form and explicitly consent. The password is sent only to the same-origin website API, is cleared from form state on submission and is never entered into an MCP client.

The enrollment request requires the live application session, exact browser Origin, JSON and CSRF request header, current password, explicit consent to the selected permissions and a signed assertion for the website audience. The backend stores a unique identity/account binding and the current account credential version. Another account cannot take that identity, even after local disable. Changing the bound identity is outside initial self-service scope.

Use the displayed connection URL when the actual client's private remote MCP setup has been verified. Client-specific instructions, account/workspace eligibility and mobile availability remain pending; do not infer ChatGPT standalone iOS support from a desktop or Remote feature. The human completes Cloudflare email-code login. Never provide passwords, codes or tokens in tool arguments or chat.

**Disable all agent access** immediately blocks the account's link in UniPlanner. It applies to all clients for that linked identity; no reliable per-client Cloudflare grant identifier has been established. It does **not** revoke Cloudflare OAuth grants. Re-enrollment with fresh password proof and consent authorizes all clients whose Cloudflare grants still survive. For permanent disconnection or suspected compromise, revoke the affected grants in the provider/client surfaces before re-enrollment. The exact Cloudflare revocation operation and old-client behavior still require external verification.

Website logout removes the browser session and leaves authorized unattended agent access unchanged. Password/login-identifier credential-version changes invalidate the local agent link and require explicit enrollment again. No automatic login or password-change flow re-enables it.

## Required verification before release

Use synthetic data and two isolated accounts. Record local, tunnel and real-client results separately, including app version, account/workspace eligibility, negotiated protocol/transport and whether a desktop must remain online.

- Run the repository server/client tests, lint, client build/service-worker check and production/full dependency audits on the supported runtime.
- Run `bash scripts/smoke-client-container.sh <locally-built-client-image>` after building the actual client image (for example, `docker build -t uni-planner-client:smoke ./client`). It exercises the real entrypoint, environment rendering and `nginx -t` for the disabled default, configured and maximum-length DNS hostnames, rejects an invalid hostname, starts nginx, and verifies website/MCP isolation, cache/security headers, public authority with an explicit port, exact URI/query proxy routing and backend replacement recovery against a synthetic upstream. It also checks nginx startup with backend DNS absent. It uses an internal Docker network, publishes no ports and cleans temporary containers/network/files on exit. Docker and `nginx:alpine` are required; the script fetches the mock image if absent. Publication first waits for reusable CI test/build/lint/production-audit checks, then runs this before either image push. Also verify container native modules on the target architecture: local image smoke and macOS binaries do not establish target NAS compatibility.
- Build the actual backend image and run `bash scripts/smoke-server-container.sh <locally-built-server-image>`. The harness generates only test configuration, starts the unprivileged production image without host ports or external networking, validates health/auth/disabled-MCP responses, confirms application files are readable but unwritable, and checks a fresh database has no seeded users and passes integrity checks. It removes the temporary container and test environment file. Publication runs both runtime smoke tests before either image push. This does not prove NAS filesystem ownership or the target architecture.
- Use MCP Inspector and each target client: Claude desktop/iOS and ChatGPT desktop/web, plus an explicit investigation of standalone ChatGPT iOS availability.
- Through the real Tunnel, pass a fresh Access sign-in, inspect the website's deployed version footer and make an authenticated API request. Exercise Access expiry and service-worker update behavior; LAN success is not tunnel evidence.
- Verify discovery matches the selected grant and write switch, returned data matches the same user's website, and another test account cannot access it or reuse its cursors, artifacts or undo records. Exercise writes only on isolated staging data. Verify unknown Host, wrong host, hostile Origin, encoded/trailing paths and exact query routing.
- Exercise silent token refresh, grant expiry, provider revocation, local disable, re-enrollment with surviving grants, credential changes and backend restart. Capture no secrets or planner content in logs or documentation.

No target client or tunnel path is currently verified. If the OAuth/client gate fails, record the incompatibility and keep production rollout blocked. Continue independent local implementation without claiming external support.

## Rollback and data handling

Before authorized deployment, snapshot SQLite consistently using its backup API or a stopped writer; include WAL consistency. State stays under the existing `./data` bind mount. Apply additive migrations with MCP disabled.

Fast rollback is `MCP_ENABLED=false` plus provider grant revocation where appropriate. Retain `WEB_PUBLIC_ORIGIN` and `MCP_HOST`, and keep the restrictive nginx host routing in place. Keep additive tables; do not drop user content or restore an old database over newer planner work merely to roll back code.

`agent_links` is authorization state and deliberately excluded from portable planner exports/imports. Revoked rows preserve identity uniqueness. Concurrency epochs, mutation receipts, undo records, notification attempts and export artifacts are also excluded; version-9 backups include device preference profiles and the saved agent activity icon choice. Website backup restoration rotates the account epoch, clears its ephemeral operation/artifact state and revokes its link. A disaster-recovery database snapshot can contain older grants; keep MCP disabled and revoke/invalidate restored authorization state before requiring fresh enrollment. Do not assume an old database snapshot represents the current consent state.

Production writes require the external authentication/client gate, completed shared mutation/parity/security review and deployment verification. Local tests alone do not clear this release gate. Compatibility paths without version/key headers are rejected while agent writes are enabled; old partial board operations must use the new atomic endpoints.

## Tool operation contract

After upgrading the task-activity feature, refresh the client's tool discovery (reconnect if the client caches its tool list). A connection with `planner_write` and enabled writes should discover `dismiss_task_agent_activity`; read-only connections should not. This uses the existing planner grant and does not add a new permission. Client-specific refresh behavior remains unverified.

Task reads expose nullable `agent_activity_at` and `agent_activity_action` fields. The server stamps `created` for a new task or copy created through MCP, and `moved` when MCP changes an assigned date, including assignment or unassignment. Other MCP edits and same-date moves do not create a new marker. These fields cannot be supplied in task-write arguments. They record the interface used, not proof that the agent acted without a human request or confirmation.

Assigned and unassigned website cards show a dismissible activity icon with action/date/time text. Website task edits clear the affected card's marker; automatic renumbering does not clear neighboring cards. `dismiss_task_agent_activity` provides the same persistent dismissal through MCP and requires the task ID, `expectedVersion` and `idempotencyKey`. Verify creation, date changes, clearing, dismissal, cross-account denial and authorization expiry/revocation through the real Tunnel and Access gate before calling this feature deployment-verified. Local verification passes: 964 server tests and 343 client tests, plus the production client build and service-worker check. Lint reports no errors (three existing warnings across server/client). A synthetic browser preview verified marker placement, light/dark appearance and dismissal. Real Tunnel/Access and client discovery-refresh verification remain pending; this change has not been deployed.

Read the planner version from a fresh result before editing. Supply that exact `{epoch,revision}` as `expectedVersion` and a new UUID `idempotencyKey` for an intended mutation. Retry the identical payload with the identical key after uncertain transport failure. A conflict requires re-reading and reconsidering the edit; never silently substitute a newer version. Receipts distinguish the historical `resultVersion` from `currentVersion`, replay and an already-undone operation. Undo needs its operation ID, matching current version and its own stable retry key within thirty seconds. Any intervening planner edit can reject undo. Receipts last 24 hours and are capped at 2,000/account; after expiry, the same key no longer guarantees deduplication. Inspect `undoAvailable` before offering undo: recovery is bounded and some operations do not support it.

Task reads default to stored data. Explicit materialization and daily-quote selection need planner write consent and enabled writes; holiday-cache refresh is public reference maintenance. Profile preference edits require an explicit owned profile ID. Test notification sends use the stored recipient, permit three attempts/hour and track pending/sent/failed/unknown delivery. They are not exactly-once email delivery. An unknown result must not be retried under a new key; a retained retry key never resends. Exports are frozen up to 5 MiB, limited to two live artifacts/account, expire after ten minutes, and use chunks of up to 48 KiB before base64 encoding. Check the complete SHA-256 checksum; exported backup data includes the saved notification email in plaintext.

Ordinary request bodies are limited to 32 KiB, with a 1 MiB JSON-envelope allowance only for CSV import. Pages default to 50 records and accept at most 100; tool results are limited to 256 KiB. Limits additionally apply to IP/account requests, mutations and bulk work; see the [security record](mcp-security.md). The fifteen-second response deadline is not transaction cancellation. After an uncertain write result, follow the retry contract rather than assuming the edit did not commit.
