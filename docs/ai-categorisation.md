# AI list suggestion (optional)

When an owner opens the website's **new task** dialog and types a title or note,
a cheap Anthropic model may suggest one of the owner's lists and the dialog
pre-selects it. It never applies to edits, to tasks created through MCP or the
agent account, or to anything after saving. The server only returns a suggestion;
it never writes a task.

## Enabling

- Server: set `ANTHROPIC_API_KEY` (optionally `AI_LIST_MODEL`, default
  `claude-haiku-5-5`, and `AI_LIST_DAILY_LIMIT`, default 100 per user per UTC
  day). Without a key the feature is unavailable: `GET /api/auth/me` reports
  `ai_list_available: false`, the Settings toggle is hidden, `PATCH /api/ai/settings`
  refuses to enable (409) and no request is ever made.
- User: Settings -> Planner -> "Suggest a list for new tasks with AI" (default off).

## Data flow

`POST /api/ai/list-suggestion { title, description }` -> server -> one
non-streaming `messages.create` call -> `{ listId: number | null }`.

Sent to Anthropic: the system prompt, the owner's list names as `L1: Name`,
the task title (capped at 200 characters) and note (capped at 2000). Nothing
else: no database ids, no email, no dates, no other tasks. List keys are
opaque (`L1`..`Ln`, plus `keep`) and are mapped back to ids on the server, only
to the requesting owner's own lists. Output is constrained with structured
outputs (`output_config.format` json_schema, enum of the keys) and re-validated
strictly with zod; anything else yields `null`. `max_tokens` is 48, no thinking,
10 s timeout, SDK retry at most once.

Text leaves the server while the owner types (after a ~1.2 s pause), not only on
save.

## Cost controls

Client: debounce, only when the title has at least 3 non-space characters (or the
note 10), abort of in-flight requests, per-dialog cache, at most 3 model calls
per opened dialog, no calls once the user picked a list manually, none when the
dialog was opened from one list's "+" button (the list is already chosen), none
with fewer than two lists or when the feature is off. Server: in-memory LRU
cache (10 min, keyed by user, normalised text and the list set; hits cost nothing
and do not count against the cap), per-account limiter (12 requests/min), daily
cap in the `ai_usage` table, 4 concurrent model calls globally.

## Threat model

- Prompt injection: task text and list names are untrusted. They are delimited
  and markup-escaped, the system prompt says they are data, and the model can only
  answer with an opaque key from a fixed enum. The worst outcome is a wrong list
  pre-selection that the user sees and can change.
- Cost abuse: opt-in per user, per-minute limiter, daily cap, concurrency cap,
  cache. A compromised owner session can spend at most the daily cap.
- Key handling: environment only (never in the repo, logs, responses or the
  client); the SDK is given the key explicitly. `ANTHROPIC_BASE_URL` is read from
  the environment only.
- Privacy: the task text is personal data sent to Anthropic, which acts as a
  processor for this purpose. Check Anthropic's current commercial terms and data
  retention for your account before enabling; this document does not assert them.
  Enabling is an explicit per-user choice and the toggle says what is sent.
- Logging: only outcome kinds (`ai_list.suggested|kept|cache_hit|skipped_*|
  invalid_output|error`), user id, latency, and for errors the error class and HTTP
  status. Never the text, list names, prompt, model output or key.
- Agent/MCP: `/api/ai/*` is not in `middleware/agentScope.js`, so the agent
  account gets 403, and the router additionally rejects non-owner principals.
  No MCP tool exists (recorded gap in `docs/mcp-capabilities.md`).
- Backup: `ai_list_enabled` is user content and is exported/restored; `ai_usage` is
  ephemeral cost state and is excluded (AR-15 exception).

## Disable / rollback

Unset `ANTHROPIC_API_KEY` and restart: the feature is off for everyone and the
stored per-user flags are inert. Per user: switch the Settings toggle off. To remove
fully, revert the change; the `ai_list_enabled` column and `ai_usage` table are
harmless if left in place.

## Unverified

Real Anthropic API behaviour (model availability of `claude-haiku-5-5`, structured
output acceptance) and the Cloudflare Tunnel/Access path (AR-16) have not been
exercised.
