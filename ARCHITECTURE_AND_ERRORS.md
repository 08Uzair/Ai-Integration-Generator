# Application Architecture & Complete Error Analysis — AI Integration Generator (CUSTOM_MCP)

This document explains **how the whole application works** (block diagrams + step-by-step explanations) and then gives a **complete catalogue of everything that can go wrong**: what happens when each step fails, why the error occurs, and exactly how to fix it.

It covers the **platform** (web wizard, CLI, backend API, MongoDB, generator engine) and the **generated projects** the platform produces (MCP server, AI chat server, AI chat component) — because both are part of "the application".

---

# PART A — HOW THE APPLICATION WORKS

## A1. What the project is

A full-stack tool that turns **any existing HTTP API** into a ready-to-run **AI assistant project**:

- an **MCP server** (exposes your API endpoints as typed, callable MCP *tools*)
- an **AI chat backend** (streams answers from Groq while calling those tools)
- a **drop-in chat UI** (`AiChat.jsx`)
- plus Docker config, `.env.example` files, README and a launcher script — everything packaged as **ZIP downloads**.

The user drives an **8-step wizard** that exists twice:
1. **Web wizard** — Next.js app on `http://localhost:3000`
2. **Terminal CLI** (`ai-generate`) — interactive prompts

Both are thin clients of one **Express backend** (`http://localhost:4000`) which stores state in **MongoDB** and runs the actual generation in the **background**, so the user sees live step-by-step progress.

## A2. System context (top-level block diagram)

```
                                    DEVELOPER / USER
                                    (wizard steps 1-8)
                                           |
                  +------------------------+--------------------------+
                  | browser (Next.js UI)   | terminal (interactive CLI)
                  v                        v
        +---------------------+   +------------------------+
        |  FRONTEND  :3000    |   |  CLI  (ai-generate)    |
        |  Next.js 14 app     |   |  @clack/prompts UI     |
        |  8-step wizard UI   |   |  8-step wizard (text)  |
        +----------+----------+   +-----------+------------+
                   |                          |
                   |   HTTP REST + JSON   (envelope {success,data}|{success,error})
                   +------------+------------+
                                v
        +------------------------------------------------------------+
        |   BACKEND API  :4000   (Express 4 + Mongoose + Zod)        |
        |   middleware: helmet -> cors -> json(1MB) -> morgan        |
        |   rate limit -> zod validate -> asyncHandler -> service    |
        |                                                             |
        |   endpoints: /api/health                                    |
        |      POST /api/integrations/validate  (probe target API)    |
        |      POST /api/integrations/discover  (probe + find tools)  |
        |      POST /api/integrations/preview   (pure plan compute)   |
        |      POST /api/integrations/generate  (enqueue job -> 202)  |
        |      GET  /api/integrations            (list)               |
        |      GET  /api/integrations/:id        (detail)             |
        |      GET  /api/integrations/:id/status (poll job)           |
        |      GET  /api/integrations/:id/download?package=... (zip)  |
        |      DELETE /api/integrations/:id      (cleanup)            |
        +--+------------+-----------------------+---------------------+
           |            |                       |
           v            v                       v (background job)
   +------------+  +---------------------+   +----------------------------+
   |  MONGODB   |  |  GENERATOR ENGINE   |   |  TARGET API  (user's API)  |
   |  :27017    |  |  @aig/generator     |   |  probed during validate &  |
   |  models:   |  |  analyzers/         |   |  discover (SSRF-guarded)   |
   |  User      |  |  template engine/   |   |                            |
   |  Integration|  |  zip service/      |   |                            |
   |  Generation |  |  templates/        |   |                            |
   |  Job        |  +----------+---------+   +----------------------------+
   |  Generated  |             |
   |  Project    |             v  writes files
   +------------+     +--------------------+
                      |  generated/ dir     |   <integrationId>/<slug>-generated-ai-integration/
                      |  + 4 ZIPs per run   |   complete | mcp-server | ai-server | ai-chat
                      +----------+----------+
                                 |  downloaded & run by the user
                                 v
        +------------------------------------------------------------+
        |   GENERATED PROJECT (standalone, what the user finally     |
        |   runs against their own API):                             |
        |                                                             |
        |  AiChat.jsx  ->  ai-server :4000  <->  Groq (LLM)           |
        |                      |                                     |
        |                      v  (MCP JSON-RPC over HTTP)            |
        |                 mcp-server :5000  ->  TARGET API            |
        +------------------------------------------------------------+
```

## A3. Directory layout and role of every folder

| Folder/file | Role |
|---|---|
| `frontend/` | Next.js 14 web wizard, dashboard, detail pages (port 3000) |
| `cli/` | Publishable interactive terminal wizard (`ai-generate`) |
| `backend/` | REST API + background generation job engine (port 4000) |
| `generator/` | `@aig/generator` workspace package — probing/analyzing, template rendering, zipping |
| `generator/templates/` | Source templates: `mcp-server/`, `ai-server/`, `ai-chat/`, `project-docs/` (contain `{{TOKEN}}` placeholders) |
| `app/` | A previously generated project ("myApp", target API `localhost:8100`) checked in as a reference/sample; its `routes.txt` is reusable as wizard input |
| `generated/` | Artifact store: extracted projects + ZIPs (git-ignored, auto-expired after 24 h) |
| `run.ps1` | One-command launcher (install / dev / cli / stop) |
| `docker-compose.yml` | Platform stack: mongo + backend + frontend |
| `Flow.md` | CLI data-flow documentation |
| `README.md` | Main project documentation |

## A4. The two storage models — platform vs generated project

**Platform (MongoDB, `backend/src/models/`):**

```
Integration (one row per generation request)
  name, appUrl, apiBaseUrl, authType (none|bearer|api-key|custom-header|basic),
  authConfig (metadata only - NEVER secret values),
  aiConfig {provider:'groq', model}, discovery, endpoints, tools,
  status: draft | generating | ready | failed

GenerationJob (progress of one background run, linked by integrationId)
  status: queued | running | completed | failed
  steps[]: 7 entries {label, status: pending|running|completed|failed, detail}
  currentStep, error, result

GeneratedProject (download metadata - NOT the files themselves)
  artifacts.complete / artifacts.parts.{aiServer,mcpServer,aiChat}
  {fileName, sizeBytes, sha256}, status: generating | ready | expired
```

**Generated project (files on disk, e.g. `app/`):**

```
<slug>-generated-ai-integration/
├── README.md  docker-compose.yml  run.ps1  .gitignore  <slug>.code-workspace
├── mcp-server/      (Express + @modelcontextprotocol/sdk, port 5000)
│   └── src/{server.js, config/env.js, config/tools.js (GENERATED data),
│            tools/index.js, services/endpoint.service.js,
│            adapters/api-adapter.js, resources/api-info.js, utils/errors.js}
├── ai-server/       (Express + SSE + OpenAI SDK -> Groq, port 4000)
│   └── src/{server.js, config/env.js, routes/chat.routes.js,
│            controllers/chat.controller.js, services/chat.service.js,
│            mcp/mcp-client.js, providers/{ai-provider,groq.provider}.js,
│            utils/sse.js}
└── ai-chat/         (AiChat.jsx self-contained React component + INSTALL.md)
```

Key design point: generated MCP tools are **pure data** (`tools.js` exports `TOOLS = [...]`). One generic executor (`endpoint.service.js` + `api-adapter.js`) executes any tool against the target API. The generated project is never an open proxy — only the endpoints you listed become tools.

## A5. The 8 wizard steps (shared by Web UI and CLI)

| Step | Name | What the user provides | Backend call |
|---|---|---|---|
| 1 | Application | name (≥2 chars), appUrl (optional), apiBaseUrl (required, http/https) | — |
| 2 | Authentication | none / bearer / api-key / custom-header / basic (+ secrets **only for live tests**) | — |
| 3 | AI | nothing — fixed Groq provider + model `openai/gpt-oss-120b` | — |
| 4 | API Discovery | route-file import (`.txt/.js/.ts`), **live test**, or manual endpoint entry | `POST /discover` |
| 5 | Request payloads | body schema for POST/PUT/PATCH endpoints (JSON example paste or field editor) | — |
| 6 | Preview | review generated plan (ports, tool list, env contract) | `POST /preview` |
| 7 | Generate | confirm — background job runs 7 steps | `POST /generate` |
| 8 | Download | pick packages: complete / mcp-server / ai-server / ai-chat | `GET /:id/download` |

```
  Step1   Step2    Step3   Step4          Step5   Step6     Step7          Step8
 name/url  auth     ai     discovery     payload  preview   generate       download
  │        │        │       │   │         │        │          │               │
  └────────┴────────┴───────┤   ├─────────┴────────┴───┬──────┴───┬───────────┘
                            │   │                      │          │
                     routes.txt │                  POST /preview  │
                     manual     │                      │          │
                     └────► POST /discover ────────────┘          │
                            │ (probe target API,       POST /generate (202)
                            │  find/import endpoints)  creates Integration+Job,
                            │                          starts background runJob
                            └────► endpoints+payloads  GET /:id/status (poll 2 s)
                                                      shows 7 job steps live
                                                      GET /:id/download -> ZIP
```

Secret-handling rule: real credentials (tokens/passwords) are sent **only** to `/discover` (live test). `/preview` and `/generate` get a *metadata-only* auth config. Secrets are never stored in MongoDB and never written into generated files — the developer fills real values into the generated `.env` afterwards.

## A6. Backend request processing pipeline

Every HTTP request goes through the same stack (`backend/src/server.js:13-33`):

```
Request
  -> helmet() (security headers)
  -> cors() (origin allow-list)
  -> express.json({limit:'1mb'})      [malformed JSON -> 400 INVALID_JSON]
  -> morgan (logging)
  -> /api router -> rate limiter (429 RATE_LIMITED)
  -> validate()  (Zod on body/params/query)   [bad -> 400 VALIDATION_ERROR]
  -> controller (wrapped in asyncHandler)
  -> service -> generator engine OR MongoDB
  -> response helpers ok()/accepted()  {success:true,data}
   OR -> next(err) -> central errorHandler  {success:false,error:{code,message,details}}
        notFoundHandler -> 404 NOT_FOUND
```

Three "modes" of operation for the backend endpoints:

1. **Synchronous compute**: `validate`, `discover`, `preview` — the request waits while the engine probes/plans; results returned immediately.
2. **Asynchronous job**: `generate` — returns **202 Accepted** right away with `{integration, job}`; the job runs in the background (fire-and-forget) and writes progress to MongoDB; clients poll `GET /:id/status`.
3. **CRUD / file**: `list`, `detail`, `status`, `download` (streams a ZIP), `delete`.

## A7. The background generation job (7 steps)

`POST /generate` (`backend/src/services/generation.service.js`) does:

```
enqueueGeneration()
  1. Integration.create(...)          status 'generating'
  2. GenerationJob.create(...)        status 'queued', 7 pending steps
  3. link integration.jobId
  4. runJob(jobId)                    fire-and-forget (NOT awaited)
  5. respond 202 {integration, job}   <- wizard stores integration._id
```

`runJob` then executes (each step persisted to Mongo as it runs):

```
[0] validate   generator.validateApi(config)
               probes target API: serverReachable? apiReachable?
               jsonDetected? endpointDetected? checks[] + latency
    | success
[1] analyze    generator.analyzeEndpoints(config.endpoints)
               -> tools[]: {name, description, inputSchema,
                            request{method,path,pathParams,queryParams,body},
                            payloadGuide}
    | tools stored back into config
[2] mcp-server     ┐
[3] ai-server      │  generator.generateProject(config)  (single call)
[4] ai-chat        │   render templates ({{TOKEN}} replacement)
[5] docs           │   + project-docs, .env.example, code-workspace,
[6] zip            ┘   4 zips + sha256 into generated/
    -> GeneratedProject.findOneAndUpdate(upsert)  artifact metadata
    -> job 'completed', integration 'ready'
    (wizard StepGenerate shows all green, enables Download)

ANY throw anywhere in runJob:
    -> integration.status = 'failed'
    -> current step      = 'failed' (detail = err.message)
    -> job.status        = 'failed' (error   = err.message)
    -> wizard/CLI polling sees it and shows the error
```

Inside `generateProject` (`generator/src/services/generation.service.js:23-98`) the order is:
delete+recreate output dir → render `ai-server` + `mcp-server` templates → render `ai-chat` → re-render mcp README with documentation tokens → render `project-docs` (README, docker-compose, .gitignore, run.ps1) → write `<slug>.code-workspace` → write both `.env.example` files (secret values always empty) → build 4 ZIPs (complete + 3 parts) with sha256.

## A8. Discovery & validation internals (what the generator probes)

```
POST /validate or /discover        config: {apiBaseUrl, auth(transient)}
   |
   +--> normalizeBaseUrl()
   +--> SSRF guard check (protocol http/https, no creds in URL,
   |        blocks private IPs / localhost / .local / DNS-resolved IPs)
   +--> HEAD probe (falls back to GET)   -> serverReachable
   +--> endpoint probe (any status proves API reachable;
   |        400/401/403/404 still count as reachable)   -> apiReachable
   +--> JSON sniffing of response body                     -> jsonDetected
   +--> discover: try ~14 OpenAPI candidates
   |        (/openapi.json, /swagger.json, /v3/api-docs, ...)
   |        parse JSON or YAML -> convertSpecToEndpoints  -> source:'openapi'
   +--> if nothing found: probe root, fall back to one
   |        manual root endpoint                          -> source:'manual'
   +--> checks[] summary + latencyMs + serverInfo
   |
   v
 returned to wizard (endpoints list)  OR  ApiError 400 VALIDATION_FAILED / DISCOVERY_FAILED
```

Every probe uses `safe-fetch.js`: SSRF-guarded, timeout-limited (10 s default), redirects capped at 2 with re-check per hop, body truncated at 200 000 chars, and it **never throws** — it returns `{ok:false, error:{code}}` so analysis can continue.

## A9. The generated runtime (what the user finally runs)

Once downloaded, unzipped and configured (real `.env` secrets + `GROQ_API_KEY`), the generated project runs in **three layers**:

```
 END USER                       YOUR INFRASTRUCTURE
 +--------+      SSE events (server-sent)
 |AiChat. | ---------------------------------------------+
 |jsx comp|                                            | streamed deltas
 +--------+                                            v
    |                                      +------------------------+
    | POST /api/chat {messages,userId}    |  AI SERVER :4000       |
    +----------------------------------->  |  ChatService loop:     |
                                           |  system prompt         |
                                           |  (payload rules for    |
                                           |   each tool)           |
                                           |                        |
                                           |  Groq (openai SDK,     |
                                           |   Responses API)       |
                                           |   model fallback chain,|
                                           |   429 retry+backoff    |
                                           +-----+--------------+---+
                                                 |              |
                                  when the model |requests a tool|
                                                 v              |
                                        +---------------+       |
                                        | MCP client    |       |
                                        | (Streamable   |       |
                                        |  HTTP client) |       |
                                        +-------+-------+       |
                                                | MCP JSON-RPC  |
                                                v (POST /mcp)   |
                                        +-----------------+      |
                                        | MCP SERVER :5000|      |
                                        | tools/list      |      |
                                        | tools/call      |      |
                                        | resources/read  |      |
                                        +--------+--------+      |
                                                 | executeTargetRequest
                                                 v                 |
                                        +-----------------+       |
                                        | TARGET API      | <-----+ (result fed back
                                        | (your API)      |        to the model, next
                                        +-----------------+        round)
```

Behaviour highlights of the loop (`ai-server/src/services/chat.service.js`):
- bounded tool-calling loop, max `MAX_TOOL_ROUNDS` (default 5) per user message;
- each tool call is emitted as `tool_call` / `tool_result` SSE events so the UI can render it;
- if a tool call throws, the error is **fed back to the model as text** so the AI can apologize or retry differently;
- the model receives a strict payload contract per tool (generated `payloadGuide`) to reduce wrong arguments;
- if the MCP server is unreachable, the AI **still answers without tools** (graceful degradation, reconnect cooldown 30 s);
- history trimmed to `MAX_HISTORY_MESSAGES` (20).

MCP server details (`mcp-server/src/server.js`): one MCP `Server` instance per HTTP session (`mcp-session-id` header), idle sessions garbage-collected after 12 h, `GET /health`, tools executed through the env-driven adapter (`TARGET_API_AUTH_TYPE`, `TARGET_API_TOKEN`, etc.).

## A10. Lifecycle tooling — how everything starts and stops

`run.ps1` (root) — one-command launcher for the **platform**:

| Switch | Action |
|---|---|
| `-Install` | `npm install` in backend + frontend (fails with exit 1 if a folder is missing or install fails) |
| `-Dev` | backend runs with `node --watch` (auto-restart) |
| `-Cli` | installs cli deps if `-Install` also given, waits ≤30 s for backend health on :4000, then runs the CLI in the foreground |
| `-Stop` | kills whatever listens on :3000/:4000 + any node/npm/cmd process whose command line contains the repo root |

Steps: check `node.exe` (missing = fatal) → warn (not fatal) if MongoDB :27017 is unreachable → check `node_modules` (missing = exit 1 with hint to run `-Install`) → start backend as a PowerShell background job → start frontend → monitor loop printing timestamped logs (`[BACKEND]`/`[CLIENT]`) → on Ctrl+C stops jobs and sweeps ports. Job failures inside the loop are only logged (no restart).

`docker-compose.yml` (root) — platform stack: `mongo:7` (healthchecked) + backend (env from compose; `ALLOWED_PRIVATE_HOSTS=""` so SSRF protection is fully ON; volume `./generated:/app/generated`) + frontend.

## A11. Ports and environment variables

| Port | Owner |
|---|---|
| 3000 | Web wizard (frontend) |
| 4000 | Platform backend **and** generated `ai-server` |
| 5000 | Generated `mcp-server` |
| 27017 | MongoDB |
| 8100 | Sample target API (`app/`, only if you run it) |

Backend env vars (`backend/src/config/env.js`, Zod-validated, fail-fast on error): `PORT`, `NODE_ENV`, `CORS_ORIGINS`, `MONGO_URI`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` (60), `RATE_LIMIT_STRICT_MAX` (10), `ALLOWED_PRIVATE_HOSTS`, `REQUEST_TIMEOUT_MS` (10 000), `ARTIFACT_TTL_HOURS` (24), `ARTIFACT_DIR`.
Frontend: `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`). CLI: `API_URL` / `BACKEND_URL` (default same).

---

# PART B — COMPLETE ERROR ANALYSIS

## B1. The error philosophy of the app (read this first)

Everything in the platform is designed to produce a **structured, non-crashing failure**:

1. **Error envelope** — every API failure returns `{ success: false, error: { code, message, details } }` (never a raw stack trace). The web UI and CLI both unwrap this and show `message`.
2. **Central error handler** — `backend/src/middleware/errorHandler.js` maps: `ApiError` → its status; Mongoose validation → `400 VALIDATION_ERROR`; malformed JSON body → `400 INVALID_JSON`; anything else → `500 INTERNAL_ERROR` (stack only logged, never leaked).
3. **asyncHandler** — every controller is wrapped so a rejected promise becomes `next(err)` instead of an unhandled crash.
4. **The prober never throws** — `safeFetch` returns structured error objects, so a dead target API becomes a *checklist item* or a 400 with details, not a 500.
5. **Background jobs isolate failure** — a failing generation marks the job/integration `failed` with the exact step and message; the API itself stays healthy.
6. **The generated code degrades gracefully** — Groq rate limits retry/fallback; MCP down → AI answers without tools; client disconnect is handled; tool errors are returned to the model instead of crashing the stream.
7. **MongoDB is optional at boot** — if Mongo is down the backend still starts; health shows `degraded` (persistence calls fail later though).

Because of this design, most "errors" are **recoverable states** rather than crashes. The rest of Part B lists every possible failure, grouped by lifecycle phase.

## B2. Error-code catalogue (every code the app can produce)

| Code | HTTP | Produced by | Meaning |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | backend Zod middleware / Mongoose | Input payload invalid (per-field `details`) |
| `INVALID_JSON` | 400 | errorHandler | Request body is not valid JSON |
| `VALIDATION_FAILED` | 400 | integration.service | Target API probe failed the checks |
| `DISCOVERY_FAILED` | 400 | integration.service | Discovery probe failed the checks |
| `INTEGRATION_NOT_FOUND` | 404 | controller | Integration id unknown / wrong format |
| `ARTIFACT_NOT_FOUND` | 404 | controller | ZIP missing or expired on disk |
| `NOT_FOUND` | 404 | notFoundHandler | Unknown route or resource |
| `RATE_LIMITED` | 429 | rateLimiters | Too many requests in the window |
| `INTERNAL_ERROR` | 500 | errorHandler | Any uncaught/unexpected server error |
| `TIMEOUT` | — | frontend/cli api clients | Request took longer than the client timeout |
| `NETWORK_ERROR` | — | frontend/cli api clients | Cannot reach the backend at all |
| `DOWNLOAD_FAILED` | — | frontend/cli downloaders | ZIP download returned non-OK |
| (SSRF probe) | — | safe-fetch | Probe blocked: private address — codes `SSRF_BLOCKED`, `TOO_MANY_REDIRECTS`, `TIMEOUT`, `NETWORK_ERROR` |
| (generated mcp) | — | mcp-server adapter | `TOOL_NOT_FOUND` 400, `TARGET_HTTP_ERROR` (status+body), `TARGET_API_TIMEOUT` 504, `TARGET_API_UNREACHABLE` 502 |
| (generated mcp) | — | mcp server.js | `SESSION_NOT_FOUND` 404, `TRANSPORT_ERROR` 500 |
| (generated ai) | — | ai-server | `MCP_UNAVAILABLE` (tools list), `INTERNAL_ERROR` 500, provider-level friendly messages for 401/404/429 |
| CORS | 500 | cors.js → errorHandler | Browser origin not in allow-list (note: mislabelled 500, should be 403) |

## B3. Phase-by-phase failure analysis

For each phase: **[When]** = where in the flow, **[What happens]** = impact when it fails, **[Why]** = root causes, **[Fix]** = solution, **[Where]** = code pointer.

---

### PHASE 1 — Startup & environment

#### F1. Node.js is not installed
- **[When]** Running `run.ps1`, or any npm script.
- **[What happens]** `run.ps1` terminates immediately (`Get-Command node.exe -ErrorAction Stop`). Docker-only users unaffected.
- **[Why]** Script requires Node ≥ 18.17 (root `package.json` engines).
- **[Fix]** Install Node.js ≥ 18.17 from https://nodejs.org, restart the terminal, re-run.
- **[Where]** `run.ps1` step 3.

#### F2. `npm install` fails
- **[When]** `run.ps1 -Install`, `npm install` at root, or per-workspace install.
- **[What happens]** Script prints "npm install failed." and exits 1. Platform will not start (missing modules).
- **[Why]** No internet, registry unreachable, proxy/VPN issues, corrupted npm cache, node_modules partially written, node/npm version mismatch.
- **[Fix]** Delete `node_modules` + `package-lock.json`, re-run `npm install`; check network/proxy; use a mirror registry if needed. Never mix workspaces installs manually — install from root (npm workspaces hoist).
- **[Where]** `run.ps1` step 5.

#### F3. MongoDB is down / unreachable at backend boot
- **[When]** Backend starts (`npm run dev:backend`, `run.ps1`, docker).
- **[What happens]** Backend **still starts and serves** — the boot logs `[db] MongoDB connection failed - API works, persistence does not`; `GET /api/health` reports `database:'disconnected'` and `status:'degraded'`. **Every persistence call then fails**: creating an integration (`POST /generate`) → 500 `INTERNAL_ERROR`; job progress can't be saved. One retry attempt is made after swapping DNS to public resolvers (8.8.8.8 / 1.1.1.1) when the error matches `querySrv / ENOTFOUND / ECONNREFUSED / EAI_AGAIN`.
- **[Why]** Mongo not installed/running; wrong `MONGO_URI` (host/port/db name); Atlas SRV DNS resolution problems (common on flaky DNS — `querySrv` failure); firewall; auth failure; `mongod` not started.
- **[Fix]** Start MongoDB (or Docker `mongo:7`), verify `mongosh --eval "db.runCommand({ping:1})"` works; check `MONGO_URI` in `.env`; for Atlas SRV issues fix system DNS or use the non-SRV form. run.ps1 only *warns* about Mongo — check the yellow warning.
- **[Where]** `backend/src/config/database.js:21-31`, `backend/src/server.js:37-39`.

#### F4. MongoDB dies mid-session (after boot)
- **[When]** Any time while the backend runs — e.g. laptop sleep, container restart, network drop.
- **[What happens]** Events log `[db] MongoDB disconnected`. In-flight `runJob` step saves (`setStep`/`setJobStatus`) throw → the job catch marks the job `failed`. Polling endpoints start erroring (500) until Mongo returns. After reconnect the app works again, but the failed job must be restarted (new generate).
- **[Why]** Connection drop, replica-set election (Atlas), resource exhaustion, network change.
- **[Fix]** Ensure Mongo is stable (Docker `restart: unless-stopped`, retry logic). If a job was marked failed due to DB outage, simply run the wizard generate step again. Consider adding automatic retries inside runJob on transient DB errors.
- **[Where]** `backend/src/config/database.js:45-47`, `backend/src/services/generation.service.js:145-151`.

#### F5. Invalid environment variables
- **[When]** Backend boot, and also each generated project boot (mcp-server / ai-server env.js).
- **[What happens]** Zod `safeParse` prints every issue and calls `process.exit(1)` — process refuses to start. Example: `PORT=abc`, `RATE_LIMIT_MAX=notanumber`, invalid `ALLOWED_PRIVATE_HOSTS`.
- **[Why]** Corrupted `.env`, wrong variable names/types, copy-paste of partial env.
- **[Fix]** Read the startup log — it lists each issue. Fix `.env` against `.env.example`. The same fail-fast exists in the *generated* mcp-server (`src/config/env.js:31-35`) and ai-server — real `.env` values like `TARGET_API_AUTH_TYPE` must match the enum (`none|bearer|api-key|custom-header|basic`).
- **[Where]** `backend/src/config/env.js:20-27`.

#### F6. Port already in use (3000 / 4000 / 5000 / 27017)
- **[When]** Starting backend, frontend, generated servers, Mongo.
- **[What happens]** The new process fails to bind: `EADDRINUSE`. run.ps1's monitor shows the backend job output with the error; `-Stop` was designed to sweep ports but only when called.
- **[Why]** Another instance of the app (or an unrelated process) holds the port. Generated ai-server uses port 4000 — the **same as the platform backend** — so running the platform and a generated ai-server on one machine collides unless `.env` overrides `AI_SERVER_PORT`.
- **[Fix]** Find the owner: `Get-NetTCPConnection -LocalPort 4000 | Select OwningProcess`, kill it or change the port in `.env`. For generated projects always set distinct ports (e.g. `AI_SERVER_PORT=4100`) when the platform backend also runs on 4000.
- **[Where]** `run.ps1` service table; generated `env.js` files.

#### F7. Docker deployment failures
- **[When]** `docker compose up --build` at root.
- **[What happens]** Build or runtime errors: most notably the **frontend Dockerfile fails to build** because it contains `COPY --from=builder /app/public ./public` but no `frontend/public/` directory exists.
- **[Why]** Stale Dockerfile referencing a directory that was never created in this project; also no internet for base images, port conflicts, missing `.env` for backend.
- **[Fix]** Remove the `COPY ... ./public` line (and the second-stage `COPY --from=builder ...` of `public`) from `frontend/Dockerfile`, or create an empty `frontend/public/` with a `.gitkeep`. Then rebuild.
- **[Where]** `frontend/Dockerfile`.

#### F8. `backend/.env` holds real production credentials
- **[When]** Always (security risk, not a crash).
- **[What happens]** A real MongoDB Atlas username/password + SRV URI sit in the working copy. If this repo is shared or pushed, the database is exposed.
- **[Why]** Local dev convenience; `.gitignore` matches `.env` so git won't commit it, but it's on disk for anyone with access.
- **[Fix]** Move to environment variables/secret manager; rotate the credentials if the value has ever left the machine; keep only `.env.example` committed.
- **[Where]** `backend/.env` (root `.gitignore:5`).

---

### PHASE 2 — Wizard client side (Web UI + CLI)

#### F9. Backend is not running when the wizard calls it
- **[When]** Any wizard step that calls the API (discovery, preview, generate, download), and every poll.
- **[What happens]** Client throws `NETWORK_ERROR`: "Cannot reach the API at http://localhost:4000 ... Start the backend with: npm run dev:backend". In the web UI an error Alert appears on that step; the CLI logs the error and offers Retry/Back/Quit.
- **[Why]** Backend crashed, never started, wrong `NEXT_PUBLIC_API_URL` / `API_URL`, firewall, or the browser was started before the backend.
- **[Fix]** Start backend (`npm run dev:backend` or `run.ps1`); confirm `curl http://localhost:4000/api/health`. In Docker deployments, `NEXT_PUBLIC_API_URL` is baked at image build — rebuild with the right value.
- **[Where]** `frontend/lib/api.js:49-52`, `cli/src/api.js:56-63`.

#### F10. Request timeout on a wizard call
- **[When]** Discovery (60 s client timeout), preview (30 s), generate (20 s).
- **[What happens]** Client aborts: `TIMEOUT` — "Request timed out after Xms". Discovery is the likely culprit because it probes the target API live (backend probes can run up to 10 s each plus retries).
- **[Why]** Target API slow/unresponsive, DNS hanging, backend busy generating for another user (rate limiter or event loop), Mongo slow, huge body.
- **[Fix]** Re-test the target API manually (`curl -I`), increase `REQUEST_TIMEOUT_MS` backend-side and the client `timeoutMs`, or retry when the network is calm. Note: generation *start* times out only if the DB is slow — the job itself runs in background and is fine.
- **[Where]** `frontend/lib/api.js:25-26`; timeouts in `WizardContext.jsx` `runDiscovery`/`runPreview`/`startGeneration`; CLI mirrors.

#### F11. Invalid user input in steps 1–2
- **[When]** Step 1 (Application) / Step 2 (Authentication).
- **[What happens]** Web UI shows inline field errors and disables Continue; CLI re-prompts with the validation message. No request is sent.
- **[Why]** Name shorter than 2 chars; `apiBaseUrl` not starting with `http://` or `https://`; bearer/api-key without a token; custom-header without name or value; basic without username.
- **[Fix]** Enter valid values. apiBaseUrl must be the *API root* (not the website). Tokens are only needed for live discovery — you can pick auth type `none` and add real auth later in the generated `.env` if you only plan to import a route file.
- **[Where]** `StepApplication.jsx`, `StepAuthentication.jsx`, frontend `lib/validators.js`; cli `steps/application.js`, `steps/authentication.js`.

#### F12. Step 4 returns no endpoints (or user tries to continue without endpoints)
- **[When]** After live test / file import / manual entry on the Discovery step.
- **[What happens]** Web UI: Continue disabled; shows "no endpoints" panel. CLI: logs error "At least one endpoint is required" and returns `'retry'` (re-loops the step forever until endpoints exist or Quit).
- **[Why]** Target API dead (see Phase 3 errors), route file empty/unparseable, live test found nothing, user removed all endpoints.
- **[Fix]** Check the target API is reachable from the backend machine; use the live test first (validates auth too); if the API doesn't expose OpenAPI, import a routes file (`routes.txt` style) or add endpoints manually.
- **[Where]** `WizardContext.jsx` stepAccess, cli `steps/discovery.js:208-213`.

#### F13. Route file import fails or yields zero routes
- **[When]** Discovery → import file.
- **[What happens]** Web UI shows an error/success notice; CLI validates path existence live, and on import logs "file not found / could not be read / 0 routes found" with the list of paths tried. Zero-route import leaves endpoints empty.
- **[Why]** Wrong path (CLI tries cwd → repo root → `~`, supports quoted Windows "Copy as path" strings); file uses an unsupported syntax (only `GET /path`, `router.get('/path')`, `app.post('/path')`, bare `/path` lines are recognised); file is empty or all comments.
- **[Fix]** Re-check the path; open the file and confirm route lines match one of the supported patterns (comments with `#`/`//` are stripped). Provide a `.txt` like `app/routes.txt`.
- **[Where]** cli `src/paths.js`, `src/routeParser.js` (mirrored in `frontend/lib/routeParser.js`).

#### F14. Payload step: pasted JSON example is invalid
- **[When]** Step 5 → "apply JSON example".
- **[What happens]** Validation error shown ("Invalid JSON…", "must be a JSON object"); CLI re-shows the editor; web keeps the previous state. No crash.
- **[Why]** Paste contains trailing comma, single quotes, comments, a JSON array/scalar instead of an object, or plain text.
- **[Fix]** Paste a valid JSON *object*. If the API needs an array body, wrap it: `{"items": [...]}` and describe that field as the array.
- **[Where]** cli `payload.js:62-75` (`fieldsFromExampleText` throws), frontend `StepPayload.jsx`.

#### F15. A step's Continue is disabled with no explanation
- **[When]** Any step gate.
- **[What happens]** UI simply doesn't advance (button disabled) — users often think it's stuck.
- **[Why]** Strict gating: auth requires valid name+apiBaseUrl+auth; discovery requires valid auth; payload requires discovery done; preview requires all payloads resolved (every POST/PUT/PATCH endpoint has `no body`, ≥1 field, or an example); generate requires a successful preview; download requires `generation.status === 'done'`.
- **[Fix]** Work backwards through the checklist; run the previous step again (e.g. re-run preview after changing endpoints). In the CLI, if a step shows nothing to do (e.g. AI step is informational), just Continue.
- **[Where]** `frontend/components/wizard/WizardContext.jsx:236-253` stepAccess.

#### F16. Polling during generation returns transient network errors
- **[When]** Step 7 progress screen; also dashboard/detail auto-refresh.
- **[What happens]** Web: transient poll errors are **silently ignored** (comment: "transient network errors ignored") and polling continues — good. CLI: poll errors are swallowed and the spinner keeps polling — also good, **but** if the backend stays down forever the CLI polls forever (no overall timeout).
- **[Why]** Backend restarting, short network blip, backend crashed mid-job.
- **[Fix]** Web: nothing — it recovers. CLI: add an overall deadline (e.g. fail after 10 minutes) or a Quit option during polling; as-is, press Ctrl+C if the backend is gone and re-run generate after restarting it.
- **[Where]** `frontend/components/wizard/WizardContext.jsx:191-193`, cli `steps/generate.js:77-80`.

#### F17. Delete from the dashboard card throws an unhandled rejection
- **[When]** Dashboard → delete icon on a card.
- **[What happens]** If the DELETE request fails, there is **no `.catch`** — unhandled promise rejection in the console, **no user feedback**, and the card stays until refresh.
- **[Why]** Missing error handling in the dashboard card delete code (bug in the app).
- **[Fix]** Add `.catch(err => setError(...))` to the delete call and show an Alert (like the detail page does). 
- **[Where]** `frontend/app/dashboard/page.jsx:36-44`.

#### F18. Integration detail page error becomes "sticky"
- **[When]** Detail page auto-poll (every 5 s) — any single failed poll.
- **[What happens]** Once a poll fails, the full-page error screen shows and **never clears**, even after later polls succeed (the `.then` doesn't reset `error`). Page is stuck until a manual reload.
- **[Why]** State bug in the polling `useEffect` (bug in the app).
- **[Fix]** Clear `error` at the start of every successful poll (`setError(null)` in `.then`).
- **[Where]** `frontend/app/integrations/[id]/page.jsx:22-31`.

#### F19. Download button errors
- **[When]** Step 8 or detail page → download a package.
- **[What happens]** `DOWNLOAD_FAILED` ("Download failed (HTTP x)" or JSON error body). Web shows an Alert; CLI logs per-package failure but continues with remaining packages, then reports which failed.
- **[Why]** Backend 404 `ARTIFACT_NOT_FOUND` (artifact expired/deleted), backend down mid-download, disk full (CLI writes to folder), browser popup blocker (web uses a hidden anchor click).
- **[Fix]** If the artifact expired (24 h TTL) or was deleted — re-run generation. Free disk space for CLI extraction. For popup blockers, allow downloads from the site.
- **[Where]** `frontend/lib/api.js:59-80`, cli `src/api.js:70-86`.

#### F20. React runtime crash (white screen) in the web app
- **[When]** Any render-time error.
- **[What happens]** Dev: Next.js red error overlay. Prod: blank page. **There are no error boundaries** (`error.jsx`, `global-error.jsx`, `not-found.jsx` do not exist).
- **[Why]** Unexpected null data, a component bug, bad prop from stale state.
- **[Fix]** Add Next.js `error.jsx`/`global-error.jsx`/`not-found.jsx` (or a React `ErrorBoundary` wrapper) so errors render a recoverable screen instead of a blank page.
- **[Where]** `frontend/app/` (missing files).

---

### PHASE 3 — Probing the target API (validate / discover endpoints)

These are the errors that make the **wizard's discovery fail**, and later make the **generated MCP tools fail at runtime**. The prober never crashes — it reports structured results.

#### F21. SSRF block (private/local address)
- **[When]** Wizard live test/discovery/preview pointing `apiBaseUrl` at localhost, LAN IP (192.168.x, 10.x, 172.16-31.x), 169.254.x.x, IPv6 private/link-local, or hostnames like `localhost`, `*.local`, `*.internal`, `*.lan`, `.home`, `.corp`.
- **[What happens]** Request is blocked **before** any fetch; probe check becomes `SSRF_BLOCKED`, checks list shows failure → `VALIDATION_FAILED`/`DISCOVERY_FAILED` 400 with details.
- **[Why]** SSRF protection deliberately forbids reaching internal infrastructure from the public API (the backend would otherwise be a proxy into your intranet). DNS-resolved private IPs are also blocked — an allowlist cannot override resolved addresses.
- **[Fix]** Development-only: add the hostname to `ALLOWED_PRIVATE_HOSTS` (default already includes `localhost,127.0.0.1`) and restart backend. Production/Docker: keep the allowlist empty and test against a public URL. If your target API is on your LAN, run a dev backend instance with the allowlist set, or expose a tunnel.
- **[Where]** `generator/src/utils/ssrf-guard.js:84-130`, `generator/src/utils/safe-fetch.js:16-23`.

#### F22. DNS resolution failure of the target API
- **[When]** Discovery/validate against a hostname that can't resolve.
- **[What happens]** safe-fetch returns `{ok:false}` with a network/DNS error; checks show server not reachable → 400 with `VALIDATION_FAILED`. Also `assertUrlAllowed` blocks *any* unresolvable host (treats it as unsafe).
- **[Why]** Typo in `apiBaseUrl`, domain expired, DNS server issues, no internet from the backend host (e.g. docker container without DNS), VPN required to reach the API.
- **[Fix]** `nslookup <host>` from the backend host; fix the URL; ensure the backend container/host has working DNS (`--dns` option in Docker if needed).
- **[Where]** `generator/src/utils/ssrf-guard.js:118-129`, `safe-fetch.js`.

#### F23. Target API timeout / network unreachable during probe
- **[When]** Discovery/validate; later at runtime from generated mcp-server.
- **[What happens]** Probe returns `TIMEOUT` (default 10 s, controlled by `REQUEST_TIMEOUT_MS`) or `NETWORK_ERROR`. Wizard shows failure checks; runtime MCP tool call returns **504 `TARGET_API_TIMEOUT`** or **502 `TARGET_API_UNREACHABLE`** to the AI.
- **[Why]** Server down, firewall dropping packets, wrong URL/port, TLS handshake issues, API too slow (>10 s), request blocked by WAF.
- **[Fix]** `curl -m 5 <apiBaseUrl>` from the backend machine. Increase `REQUEST_TIMEOUT_MS` (platform) / `TARGET_API_TIMEOUT_MS` (generated project) if the API is legitimately slow. Verify TLS/certificates.
- **[Where]** `generator/src/utils/safe-fetch.js:84-93`; generated `mcp-server/src/adapters/api-adapter.js` (504/502 mapping).

#### F24. Endpoint probe gets HTTP 401/403/404/400
- **[When]** Validate/discover.
- **[What happens]** Deliberately **NOT a failure**: any HTTP status proves the server is alive — 400/401/403/404 still count as `apiReachable: true`. But the discovery may find no *usable* endpoints.
- **[Why]** The probe hits the base URL root which may legitimately return 404; auth may be required at the root.
- **[Fix]** Ensure auth credentials are correct for live discovery; otherwise import the route file — the wizard then uses your listed paths directly.
- **[Where]** `generator/src/analyzers/api-analyzer.js:61-80`.

#### F25. Wrong / insufficient auth credentials during discovery
- **[When]** Live test with bearer/api-key/custom-header/basic.
- **[What happens]** Probes return 401/403; `checks` report API reachable but endpoints may be empty (protected APIs hide routes) → discovery yields nothing → user cannot proceed. Discovery does not fail hard on 401 because reachability is proven.
- **[Why]** Wrong token, expired key, wrong header name (`x-api-key` vs `Authorization`), base URL missing the `/api` segment so endpoints mismatch, auth set to `none` while the API requires it.
- **[Fix]** Double-check the exact header/format the API expects (e.g. bearer prefix handling). Note the app builds headers from your *type selection*, so pick the type matching the API's convention. Remember secrets are never stored — you can safely re-enter them per test.
- **[Where]** `generator/src/analyzers/api-analyzer.js:116-138` (`buildAuthHeaders`).

#### F26. OpenAPI spec exists but fails to parse
- **[When]** Discovery probes OpenAPI candidates.
- **[What happens]** A spec file is found but YAML/JSON parsing fails → it's skipped (silently) and discovery falls back to manual root endpoint or nothing.
- **[Why]** Invalid YAML/JSON, huge spec over the 200 KB truncation, spec behind auth the prober doesn't send, Swagger UI page (HTML) served at the spec URL instead of raw JSON/YAML.
- **[Fix]** Serve a valid raw spec (`/openapi.json` etc.) with no auth, or simply import the routes file.
- **[Where]** `generator/src/analyzers/openapi-analyzer.js:44-49`.

#### F27. Target API is a SPA/website, not an API
- **[When]** Discovery against a URL that returns HTML.
- **[What happens]** `serverReachable: true` but `jsonDetected: false`, no OpenAPI, no endpoints → discovery fails/empty.
- **[Why]** `apiBaseUrl` points to the website home page instead of the API root.
- **[Fix]** Use the real API base URL (e.g. `https://api.acme.com/api/v1`). Check the JSON-detection flag in the checks UI.
- **[Where]** `generator/src/analyzers/api-analyzer.js:83-96`.

#### F28. Too many redirects during probing
- **[When]** Target API redirects (http→https, trailing-slash rewrites, auth redirect to login page).
- **[What happens]** Redirect cap (2) exceeded → probe fails with `TOO_MANY_REDIRECTS`.
- **[Why]** Redirect loops (http→https→http), or a redirect to an SSO login (SPA case again).
- **[Fix]** Use the final URL directly; use https; for SSO-protected APIs use the route-file import path instead of live discovery.
- **[Where]** `generator/src/utils/safe-fetch.js:30-50`.

---

### PHASE 4 — Preview and Generate requests

#### F29. Preview fails with 400 VALIDATION_ERROR / VALIDATION_FAILED
- **[When]** Step 6 Refresh preview.
- **[What happens]** Alert with the failure; Generate stays disabled. CLI shows failure menu (Retry / Back-to-payloads / Quit).
- **[Why]** Endpoints missing/removed between steps; an endpoint has an invalid path/URL; payload state inconsistent (endpoint with body but no fields and no example); zod validation of the assembled config failed; in rare cases the preview re-probes and the API is now down.
- **[Fix]** Read the `details` array — it names the offending field. Go back and fix payloads/endpoints, then preview again.
- **[Where]** `backend/src/validators/integration.validator.js`, `WizardContext.jsx:133-154`.

#### F30. `POST /generate` returns 400/500 (start failure)
- **[When]** Step 7 first click.
- **[What happens]** Error Alert on the generate step (web) / failure menu (CLI). No job is created. **Web UI has no retry button on this step** — you must go back and re-enter the step.
- **[Why]** Validation failed (same causes as F29); MongoDB down (500 — integration/job rows can't be created); rate-limited (429, >10 strict-limit calls/min); backend restarted between preview and generate.
- **[Fix]** Fix the reported input and retry; check Mongo is up; wait out the rate window; if the backend restarted, just click generate again (nothing was lost — nothing existed yet).
- **[Where]** `backend/src/services/generation.service.js:28-61`, `WizardContext.jsx:172-175`.

#### F31. Rate limited (429 RATE_LIMITED)
- **[When]** Any strict endpoint (validate/discover/preview/generate share a 10/min window) or the general API (60/min).
- **[What happens]** HTTP 429 with code `RATE_LIMITED`; wizard shows it as an Alert/error text.
- **[Why]** Rapid clicking or an automated loop of discovery/preview calls (common during testing).
- **[Fix]** Wait a minute (default window 60 000 ms). For heavy development, raise `RATE_LIMIT_MAX`/`RATE_LIMIT_STRICT_MAX`.
- **[Where]** `backend/src/middleware/rateLimiters.js:16`.

---

### PHASE 5 — The background generation job (7 steps)

This is the heart of the wizard's Step 7 progress bar. Because the job runs fire-and-forget, **all failures here surface via polling** (`GET /:id/status`) and mark: job step → `failed` with the message, job → `failed`, integration → `failed`.

#### F32. Job step [0] validate fails
- **[When]** runJob step 0 — re-probes the target API with the *metadata-only* config (no real secrets!).
- **[What happens]** The probe fails (e.g. `SSRF_BLOCKED`, unreachable, timeout). Job marked failed at step "validate"; integration `failed`. Wizard shows a red X on validate with the message. 
- **[Why]** **Crucial subtlety**: the background job re-validates using persisted config **without the transient secrets** you used for discovery — so any API that *requires* auth will fail the job probe if the persisted auth type is non-`none` and the endpoint checks require auth... actually the probe treats 401 as reachable, so typical failures are: API down since discovery, SSRF block on an IP that DNS resolved differently, hostname unresolvable from the backend now.
- **[Fix]** Look at the failed-step detail. If the API was simply down, restart it and press generate again (new job). If SSRF/DNS, see F21/F22.
- **[Where]** `backend/src/services/generation.service.js:108-112`.

#### F33. Job step [1] analyze fails
- **[When]** Endpoint→tool conversion.
- **[What happens]** Job fails at "analyze". Rare — this is pure in-memory computation.
- **[Why]** An endpoint has an unsupported path shape (e.g. empty path, invalid characters), or a corrupted endpoint record from a bad OpenAPI import.
- **[Fix]** Remove/fix the offending endpoint and regenerate. If it came from OpenAPI discovery, import the routes file instead.
- **[Where]** `backend/src/services/generation.service.js:115-119`, `generator/src/analyzers/endpoint-analyzer.js`.

#### F34. Job steps [2-6] (render / docs / zip) fail — filesystem or template error
- **[When]** `generateProject` runs: delete/create dirs, render templates, write files, zip.
- **[What happens]** Any throw aborts the job: step that was running shows failed with the message. Examples: `EACCES`/`EPERM` (no write permission to `generated/` — e.g. the folder is open in another process, or read-only volume), `ENOSPC` (disk full while writing ZIPs), template file unreadable, or a corrupt `{{TOKEN}}` producing invalid output.
- **[Why]** Permissions, disk space, antivirus locking files during rapid delete+recreate, long paths on Windows (`<artifactsRoot>/<integrationId>/<slug>-generated-ai-integration/...` can exceed 260 chars — a classic Windows failure), or a generator bug.
- **[Fix]** Free disk space; ensure the `generated/` folder is writable and not locked; shorten the project *name* (slug) for long paths; retry generation. For permission issues on Windows, avoid running the backend in a protected folder (e.g. `C:\Program Files`).
- **[Where]** `generator/src/services/generation.service.js:23-98`, `generator/src/zip/zip.service.js`.

#### F35. MongoDB write fails while the job is running
- **[When]** Any `setStep`/`setJobStatus`/final upsert inside runJob while Mongo is down.
- **[What happens]** The save throws → job catch marks failed; if even the failure *marking* fails, the promise chain logs to console only (the catch at `enqueueGeneration` line 56-58 swallows the log). Result: an orphaned job that the UI polls forever showing "running".
- **[Why]** Mongo dropped mid-job (F4).
- **[Fix]** Restart Mongo; the wizard job stays stuck → re-run generation. (Code improvement: retry DB saves in runJob.)
- **[Where]** `backend/src/services/generation.service.js:145-151` and `56-58`.

#### F36. User deletes an integration while its job is still running
- **[When]** Detail page DELETE during generation, or dashboard delete of a `generating` card.
- **[What happens]** `deleteIntegration` (Promise.allSettled) removes DB rows + files best-effort — but the fire-and-forget `runJob` may still be running: it can keep writing files into `generated/` (recreating a deleted dir) and may fail saving progress to the deleted job (logged). Leftover folders/zips linger until TTL cleanup.
- **[Why]** The job pipeline and delete are not coordinated (race condition by design).
- **[Fix]** Disable delete while `status === 'generating'` (UI) or cancel the in-flight job before deleting (backend). Leftover files self-clean after `ARTIFACT_TTL_HOURS`.
- **[Where]** `backend/src/services/generation.service.js:172-190`.

#### F37. Job "succeeds" but download package missing
- **[When]** Job completed → download.
- **[What happens]** 404 `ARTIFACT_NOT_FOUND` for a part that wasn't zipped.
- **[Why]** Extremely rare: partial zip failure would normally fail the job (zip promises reject). More likely the artifact already expired or the TTL sweep ran.
- **[Fix]** Re-generate. If it repeats, check backend logs for zip warnings.
- **[Where]** `backend/src/services/generation.service.js:155-169`.

---

### PHASE 6 — Download, artifacts & cleanup

#### F38. Artifact expired (24 h TTL)
- **[When]** Downloading an integration older than `ARTIFACT_TTL_HOURS` (24 h default); the backend also sweeps at boot and periodically.
- **[What happens]** Files were deleted by the sweep → `GET /download` 404 `ARTIFACT_NOT_FOUND`; detail page may show project status `expired`; job still shows completed.
- **[Why]** Designed so `generated/` doesn't grow forever; TTL is short by default.
- **[Fix]** Increase `ARTIFACT_TTL_HOURS` (or set `ARTIFACT_DIR` to a persistent volume in production) and re-generate old ones. Note: in Docker, `./generated` is a bind mount so data persists across containers but not TTL.
- **[Where]** `generator/src/services/generation.service.js:216-244` (`cleanupArtifacts`).

#### F39. Delete leaves files behind
- **[When]** DELETE /:id.
- **[What happens]** Rows are gone but some ZIP/project files remain (up to the TTL sweep).
- **[Why]** `deleteIntegration` uses `Promise.allSettled` — best-effort, failures are swallowed (file locked by antivirus, permission issue, file already gone).
- **[Fix]** Nothing user-visible needed; or delete the folder manually / run cleanup. 
- **[Where]** `backend/src/services/generation.service.js:182-187`.

#### F40. Download stream breaks mid-transfer
- **[When]** Big ZIP download.
- **[What happens]** Client gets `DOWNLOAD_FAILED` or a truncated zip that won't extract.
- **[Why]** Backend restarted mid-stream, proxy timeout, browser download interrupted, `Content-Length` mismatch after TTL sweep deleted the file between header write and stream read.
- **[Fix]** Retry. If the zip is corrupt, verify with sha256 (stored in GeneratedProject) and re-generate if needed.
- **[Where]** `backend/src/controllers/integration.controller.js:69-79`.

---

### PHASE 7 — Generated project runtime (mcp-server / ai-server / AiChat)

These errors appear *after* the user runs the generated code against their own API.

#### G1. Generated project won't start — bad .env
- **[When]** `node src/server.js` in mcp-server or ai-server.
- **[What happens]** Zod fail-fast prints every issue and `process.exit(1)`. No port bound.
- **[Why]** Missing `.env` (the generated zip only has `.env.example` — **you must copy it to `.env` and fill in real values**), invalid auth type, empty required var, port taken (4000 clash with platform backend).
- **[Fix]** Copy `.env.example` → `.env`, fill `TARGET_API_TOKEN`/`GROQ_API_KEY` etc., run the project's own `run.ps1` which does this automatically.
- **[Where]** generated `mcp-server/src/config/env.js:31-35`, `ai-server/src/config/env.js:33-39`.

#### G2. MCP tool call fails against the target API
- **[When]** AI (or a direct MCP client) calls a tool.
- **[What happens]** The AI receives a structured error inside the tool result: `TARGET_HTTP_ERROR` (non-2xx with status+body), **504 `TARGET_API_TIMEOUT`**, or **502 `TARGET_API_UNREACHABLE`**. The chat continues — the model explains the failure.
- **[Why]** Endpoint changed after generation (path/params no longer match), API requires auth not configured, API down, timeout too low (`TARGET_API_TIMEOUT_MS`), body schema didn't match what the API expects (the model sends according to the generated `inputSchema` — if payloads were skipped in step 5, the schema is loose and requests may be malformed), wrong method.
- **[Fix]** Check the error detail in the chat UI; test the call manually with curl using the exact path/params; fix `TARGET_API_*` env; update the tool registry (`tools.js`) to match API changes, or regenerate the project after changing the wizard input; lower/raise the timeout as needed.
- **[Where]** generated `mcp-server/src/adapters/api-adapter.js:58-66`.

#### G3. Unknown tool / invalid arguments
- **[When]** An MCP client calls a tool that doesn't exist, or the AI sends malformed arguments.
- **[What happens]** `TOOL_NOT_FOUND` (400) or `TOOL_EXECUTION_ERROR` (Zod arg validation failed, 400) — returned as MCP `isError` content, no crash.
- **[Why]** Stale client tool list (client cached tools before server restart with a new registry), model hallucinated arguments, argument type mismatch (e.g. array instead of object).
- **[Fix]** Re-list tools (`tools/list`) after server restart; the AI normally self-corrects from the error text; if a tool is genuinely wrong, edit `mcp-server/src/config/tools.js` or regenerate.
- **[Where]** generated `mcp-server/src/services/endpoint.service.js:15`, `src/tools/index.js:71-78`.

#### G4. MCP session errors
- **[When]** Long-running chat; multiple clients.
- **[What happens]** `SESSION_NOT_FOUND` (404) if a session id is unknown or expired (idle sessions GC after 12 h); `TRANSPORT_ERROR` (500) on malformed MCP requests.
- **[Why]** ai-server kept a stale `mcp-session-id` after the mcp-server restarted (sessions are per-mcp-server-process, in memory); idle timeout; proxies dropping the connection.
- **[Fix]** The ai-server mcp client reconnects (new session) on next tool round after a failed connect; if chat appears to "lose tools", restart ai-server too. Session GC time can be tuned in mcp-server.
- **[Where]** generated `mcp-server/src/server.js:76-138`.

#### G5. AI chat errors: missing/expired GROQ key
- **[When]** First message in the chat UI.
- **[What happens]** ai-server emits an SSE `error` event; chat returns `{ok:false}` message like "Groq API key is missing/invalid" — no 500 crash.
- **[Why]** `.env` has empty `GROQ_API_KEY` or an expired/invalid key; wrong `GROQ_BASE_URL`; regional quota.
- **[Fix]** Set a valid `GROQ_API_KEY` (https://console.groq.com), restart ai-server.
- **[Where]** generated `ai-server/src/services/chat.service.js:74-77`, `src/providers/groq.provider.js:191-206`.

#### G6. Groq rate limit (429) or model errors
- **[When]** Heavy usage or many users.
- **[What happens]** Automatic exponential backoff retries honoring `Retry-After`, up to `GROQ_MAX_RETRIES` per model, **then automatic fallback to model `GROQ_MODEL_FALLBACK`** (`llama-3.3-70b-versatile`), which retries too; only if everything fails does the user see a friendly rate-limit/error message. Streams are only retried before the first delta was emitted.
- **[Why]** Free-tier quotas, bursty traffic, model temporarily unavailable (404), plan limits.
- **[Fix]** Raise quota/plan, spread usage, tune `GROQ_MAX_RETRIES`/`GROQ_TIMEOUT_MS`. Nothing else needed — resilience is built in.
- **[Where]** generated `ai-server/src/providers/groq.provider.js:150-207`.

#### G7. MCP server is down when the AI needs a tool
- **[When]** mcp-server crashed/not started; ai-server booted before mcp-server.
- **[What happens]** Graceful degradation: chat streams a notice like "AI will answer without tools", `GET /api/tools` returns `MCP_UNAVAILABLE`; ai-server retries the connection with a 30 s cooldown, bounded by `MCP_CONNECT_TIMEOUT_MS`. Model answers from general knowledge only (may hallucinate data!).
- **[Why]** mcp-server not running, wrong `MCP_SERVER_URL`, mcp-server restarted mid-conversation, port 5000 blocked.
- **[Fix]** Start mcp-server (project `run.ps1` starts both and health-checks them); verify `curl http://localhost:5000/health`. Answers without tools should be treated as untrusted data.
- **[Where]** generated `ai-server/src/mcp/mcp-client.js:29-41`, `src/services/chat.service.js:36-50`.

#### G8. SSE stream errors / client disconnects
- **[When]** Chat response streaming; user closes tab or network drops.
- **[What happens]** ai-server catches write errors: emits `error` event → `res.end()`; if that also throws → `res.destroy()`. No crash; loop stops. Browser `AbortError` is ignored silently by AiChat.
- **[Why]** Normal web behaviour (leaving the page), proxy timeouts.
- **[Fix]** Nothing to fix — handled. Long answers could exceed proxy idle timeouts; tune if needed.
- **[Where]** generated `ai-server/src/controllers/chat.controller.js:53-61`, `AiChat.jsx` SSE reader.

#### G9. AiChat.jsx integration problems in the host app
- **[When]** Embedding `AiChat.jsx` into the customer's React app.
- **[What happens]** Component doesn't render / styles missing / markdown broken. No crash of the host app if props are wrong, but confusing UI.
- **[Why]** Missing peer deps (`lucide-react`, `react-markdown`, `remark-gfm`, Tailwind), wrong `apiUrl` prop, missing `userIdKey` for the persistence chip, React version < 18.
- **[Fix]** Follow `ai-chat/INSTALL.md` exactly (props table, package list). Ensure CORS on ai-server allows the host origin (`CORS_ORIGINS`).
- **[Where]** generated `ai-chat/AiChat.jsx`, `ai-chat/INSTALL.md`.

---

## B4. Known bugs & design weaknesses in the codebase (with fixes)

| # | Issue | Where | Impact | Fix |
|---|---|---|---|---|
| 1 | Detail-page poll error is sticky (never clears on success) | `frontend/app/integrations/[id]/page.jsx:22-31` | Page stuck on error until reload | `setError(null)` on each successful poll |
| 2 | Dashboard card delete has no `.catch` | `frontend/app/dashboard/page.jsx:36-44` | Unhandled rejection, no feedback | Add `.catch` + Alert |
| 3 | No React error boundaries anywhere | `frontend/app/` | Render crash = blank page in prod | Add `error.jsx`/`global-error.jsx` |
| 4 | Frontend Dockerfile references missing `public/` | `frontend/Dockerfile` | Docker build fails | Remove the COPY line or add `frontend/public/.gitkeep` |
| 5 | CORS-disallowed browser origin → HTTP 500 instead of 403 | `backend/src/config/cors.js:9-20` | Wrong status code, errorHandler mislabels | Reject with 403 + explicit message |
| 6 | Settings page values written to localStorage but never read | `frontend/app/settings/page.jsx` | User believes settings apply; they don't until rebuild | Wire settings into `lib/api.js` or remove the inputs |
| 7 | Duplicate `/api/health` routes (first wins) | `backend/src/server.js:19` + `backend/src/routes/index.js:6-8` | Confusing, dead code | Remove one |
| 8 | `hooks/useIntegrations.js` exported hooks unused; duplicated logic with detail page | `frontend/hooks/` | Dead code, drift risk | Delete or use |
| 9 | `startGeneration` returns stale `generation.integrationId` | `WizardContext.jsx:176` | Latent bug if a caller ever uses it | Return post-update state |
| 10 | CLI generation poll has no overall timeout | `cli/src/steps/generate.js:69-105` | Infinite polling if backend dies | Add deadline + friendly exit |
| 11 | README/Flow.md port tables stale (`4100` vs actual `4000` for generated ai-server; `app/` described as sample target app but it is a generated project) | `README.md`, `Flow.md` | Misleading docs | Update docs |
| 12 | Platform backend (:4000) and generated ai-server (:4000) share a port | `generator/.../configuration.service.js:9-12` | Collision when running both on one machine | Default generated ai-server to a different port (e.g. 4100) or document override |
| 13 | Real Mongo credentials in `backend/.env` on disk | `backend/.env` | Credential exposure | Use env vars/secret store; rotate |
| 14 | Race: DELETE during an active generation job | `backend/src/services/generation.service.js` | Orphaned files, stuck-looking job | Cancel job token / disable delete while `generating` |

---

## B5. Quick reference — "what happens if X fails?" cheat sheet

| If this fails… | You will see… | Result | Action |
|---|---|---|---|
| MongoDB down at boot | backend runs, health `degraded` | no persistence | start Mongo |
| MongoDB down during job | job marked failed (step detail) | generation fails | start Mongo, re-generate |
| Node missing | run.ps1 exits immediately | nothing starts | install Node ≥ 18.17 |
| npm install fails | "npm install failed", exit 1 | nothing starts | fix network, re-run `-Install` |
| backend down | `NETWORK_ERROR` in wizard/CLI | wizard stuck | start backend |
| probe timeout | `TIMEOUT` / failed checks | discovery fails | fix/raise `REQUEST_TIMEOUT_MS` |
| SSRF block | `SSRF_BLOCKED` check | local/LAN API blocked | allowlist (dev) or public URL |
| wrong auth | 401s, no endpoints | discovery empty | correct auth, use file import |
| bad route file | 0 routes imported | no endpoints | fix file syntax |
| bad JSON payload | inline error | step 5 blocks | paste valid JSON object |
| preview fails | Alert/menu | generate disabled | fix endpoints/payloads, re-preview |
| generate fails (start) | Alert, no retry button (web) | nothing created | fix input, go back & retry |
| job validate step fails | red X on validate | integration failed | target API down — restart it, re-generate |
| job fs/zip fails | red X on that step | integration failed | disk/permission/long path, retry |
| artifact expired | 404 `ARTIFACT_NOT_FOUND` | cannot download | re-generate / raise TTL |
| delete partially fails | silent leftovers | files remain | TTL sweep cleans |
| generated mcp bad env | exit 1 at boot | mcp down → chat w/o tools | fill real `.env` |
| target API down at runtime | 502/504 to the AI | AI reports failure | start API / fix env |
| Groq 429/401 | friendly SSE error after retries | no answer | fix key / raise quota |
| MCP server down | "answers without tools" | possible hallucinated data | start mcp-server |

---

## Appendix — how to reproduce and verify the main failure paths (testing checklist)

1. **Backend resilience**: stop Mongo, start backend → health `degraded`; call `POST /api/integrations/preview` → error surfaces cleanly. Start Mongo again → recovers.
2. **SSRF**: set `ALLOWED_PRIVATE_HOSTS=` and run discovery against `http://192.168.1.10/api` → probe blocked with a clear check.
3. **Job failure**: generate against a target API URL, then kill that API before the job's validate step → poll `GET /:id/status` until `failed` with the message.
4. **Artifact expiry**: set `ARTIFACT_TTL_HOURS=0` equivalent by back-dating a folder in `generated/`, restart backend → folder cleaned; download now 404s.
5. **Rate limiting**: fire 11 quick `/preview` calls → 429 on the 11th.
6. **Malformed JSON**: `POST /api/integrations/preview` with body `{oops` → 400 `INVALID_JSON`.
7. **Generated runtime**: run `app/` (sample project) with a real `GROQ_API_KEY`; stop mcp-server mid-chat → chat continues without tools; stop the target API → tool calls return structured 502 errors visible in chat.
8. **Frontend Docker build**: run `docker build frontend` → observe the `public` COPY failure (bug #4).

---

*This document describes the system as of the current codebase. File paths/line numbers refer to the state at the time of writing — re-check after refactors. Companion docs: `README.md` (setup/features) and `Flow.md` (CLI wire flow).*
