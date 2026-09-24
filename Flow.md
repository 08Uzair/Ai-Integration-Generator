# Flow.md - CLI data flow (step 1 to 8 + code walkthrough)

Documentation for the **`ai-integration-generator-cli`** package (`cli/`): how user input becomes a generated MCP server + AI server + AI chat project, from the moment the wizard starts until a ZIP lands on disk.

> Current architecture note: the CLI is a **client**. The actual generation happens on the backend API
> (`POST /api/integrations/...`), which stores job state in MongoDB. Everything below describes that
> wire flow. A planned "local mode" (engine bundled into the package, generation on-device) is outlined
> at the end.

---

## 1. Big picture

```
 terminal input            state (memory)                 backend API (:4000)            MongoDB            generator engine
------------------------   ------------------------------   ----------------------------   ----------------   -----------------
 stepApplication    ---->  state.name/appUrl/apiBaseUrl
 stepAuthentication ---->  state.auth.*
 stepAI             ---->  state.ai (fixed default)
 stepDiscovery      ---->  state.endpoints[]  ----(live test)----> POST /discover ----------> (reads target API)
                          state.discovery
 stepPayload        ---->  state.payloads{}
 stepPreview        ---->  state.preview <--------buildConfig---- POST /preview ------------> buildPreview()
 stepGenerate       ---->  state.generation <----config+tools---- POST /generate ----------> Integration + GenerationJob
                                  |                          <---- job.steps (poll every 2 s)
                                  |                        GET /:id/status ----------------> GenerationJob.find
                                  |                        GET /:id/download <------------- GeneratedProject.find -> ZIP file
 stepDownload       ---->  ZIP written to local folder
```

Every prompt result is stored in one mutable `state` object (`cli/src/state.js`); nothing is persisted
between runs - if the process exits, the state is gone and the wizard starts over.

---

## 2. The shared state object

Created once by `createState()` (`cli/src/state.js:35`), mutated by the steps, read by `buildConfig()`
whenever the backend must be called:

```js
{
  name: 'Acme Assistant',          // Step 1
  appUrl: 'https://acme.com',      // Step 1 (optional)
  apiBaseUrl: 'https://api.acme.com/api', // Step 1
  auth: {                          // Step 2
    type: 'bearer',                // none | bearer | api-key | custom-header | basic
    token: 'tok_...',              // used by bearer / api-key
    apiKeyHeader: 'x-api-key',     // used by api-key
    headerName: 'x-auth-token',    // used by custom-header
    headerValue: '',               // used by custom-header
    username: '',                  // used by basic
    basicPassword: ''              // used by basic
  },
  ai: { provider: 'groq', model: 'openai/gpt-oss-120b' }, // Step 3, FIXED
  endpoints: [                     // Step 4
    { method: 'GET',  path: '/users',     summary: 'List all users', source: 'file' },
    { method: 'POST', path: '/users',     summary: 'Create user',    source: 'manual' }
  ],
  payloads: {                      // Step 5, keyed by "METHOD path" (endpointKey)
    'POST /users': { hasBody: true, fields: [ { name: 'name', type: 'string', required: true, description: '' } ], example: {...} }
  },
  discovery: null,                 // set by Step 4 live test only
  preview: null,                   // set by Step 6 (the backend's full plan)
  generation: { integrationId, job, project } | null, // set by Step 7, read by Step 8
  downloadDir: undefined,          // Step 8 (default: <cwd>/<slug>)
}
```

Key helpers (`cli/src/state.js`):

| Helper            | Purpose                                                                        |
| ----------------- | ------------------------------------------------------------------------------ |
| `STEP_IDS` / `STEPS` | The 8 wizard steps + their titles/subtitles - drives navigation and headers |
| `BODY_METHODS`    | `['POST', 'PUT', 'PATCH']` - the only methods that need a payload (Step 5)     |
| `endpointKey(ep)` | `"POST /users"` - stable map key for `state.payloads` and de-duplication        |

---

## 3. The master loop (`cli/src/index.js`)

1. `banner()` prints the logo + intro.
2. `createState()` builds the empty state (section 2).
3. `main()` walks `STEPS_IMPL` (index of the 8 step functions, index.js:49) with `current` as a cursor:

```js
while (current < STEPS.length) {
  const result = await STEPS_IMPL[current](state);
  if (result === 'retry') continue;        // re-run the same step
  if (result === 'back')  current -= 1;    // previous step
  if (result === 'quit')  exit;
  // last step finished -> 'again' resets state and restarts at step 0
  const nav = await navMenu(current);      // "Continue to next / Back / Quit"
  if (nav === 'next') current += 1;
}
```

4. Every step header is drawn by `stepHeader(i)` (`cli/src/ui.js:89`) - it renders the tracker line
   (`✓ App   ✓ Auth   ...   ◆ Preview`) using `TRACK` and the current index.
5. All prompts run through `promptOrCancel()` (`ui.js:22`): any `Ctrl+C` (`clack.isCancel`) prints
   "Operation cancelled." and `process.exit(0)`.
6. Steps return `'retry' | 'back' | 'quit' | undefined` to steer the loop; `SIGINT` is handled globally
   (index.js:60).

---

## 4. Step-by-step data flow

### Step 1 - Application (`cli/src/steps/application.js`)

| User gives                       | Validation                                   | Writes to state       |
| -------------------------------- | -------------------------------------------- | --------------------- |
| Project name                     | >= 2 characters                              | `state.name`          |
| Application URL (optional)       | must start with `http(s)://`                 | `state.appUrl`        |
| API base URL                     | must start with `http(s)://`                 | `state.apiBaseUrl`    |

Nothing leaves the machine yet. These three values become `name`, `appUrl`, `apiBaseUrl` of the
config sent to the backend in steps 6-8 and appear in the generated project's `README.md`, package
names and `.env.example` values.

### Step 2 - Authentication (`cli/src/steps/authentication.js`)

| User gives                          | Writes to state          |
| ----------------------------------- | ------------------------ |
| Auth method (select)                | `state.auth.type`        |
| Bearer token (masked input)         | `state.auth.token`       |
| API-key header name + key (masked)  | `state.auth.apiKeyHeader`, `state.auth.token` |
| Custom header name + value (masked) | `state.auth.headerName`, `state.auth.headerValue` |
| Basic username + password (masked)  | `state.auth.username`, `state.auth.basicPassword` |

The wizard displays: *"Credentials are used only for the live connection test - never stored, never
exported."* This is enforced by `transientAuth()` vs `metaAuth()` (see section 5).

### Step 3 - AI Configuration (`cli/src/steps/ai.js`)

No input at all. `state.ai` already holds the fixed default from `createState()`:
`{ provider: 'groq', model: 'openai/gpt-oss-120b' }`. The screen is informational - the generated
project supports more providers, and the user drops their `GROQ_API_KEY` into the generated
`ai-server/.env` later (never asked for, never persisted here).

### Step 4 - API Discovery (`cli/src/steps/discovery.js`)

Three ways endpoints get into `state.endpoints`:

1. **Import a route file** (primary flow):
   - File path goes through `resolveFilePath()` (`cli/src/paths.js:45`) - relative paths are tried
     against `process.cwd()` first, then the repo root; `~` expands; quotes stripped.
   - `fs.readFileSync` -> `parseRouteFile(content)` (`cli/src/routeParser.js:16`) matches three syntaxes:
     - Express calls `router.get('/users', ...)` -> regex `CALL_RE`
     - Plain lines `GET /users` -> regex `PLAIN_RE`
     - Bare lines `/users` -> treated as `GET`
   - Each parsed endpoint: `{ method, path, summary: '', source: 'manual' }`; duplicates are removed
     against `endpointKey()`.
2. **Live connection test** (optional, `runLive()` at discovery.js:59):
   - `POST /api/integrations/discover` with `{ appUrl, apiBaseUrl, auth: transientAuth(state) }`
     (timeout 60 s).
   - The backend probes the target API (OpenAPI detection), returns `result.endpoints[]`, which is
     merged into `state.endpoints`; `state.discovery = result` keeps the raw probe payload for the
     preview/generate config.
3. **Manual add/remove** - builds the same endpoint shape.

Step requires >= 1 endpoint (`'retry'` otherwise).

> The generated MCP tools are later derived from these `method + path` pairs, so the summary is just
> display text.

### Step 5 - Request Payloads (`cli/src/steps/payload.js`)

Only for endpoints whose method is in `BODY_METHODS` (`POST/PUT/PATCH`); otherwise the step is
skipped. Per endpoint (keyed by `"METHOD /path"`):

- `state.payloads[key] = { hasBody: true, fields: [], example: undefined }` is created on first visit.
- **Apply JSON example**: `JSON.parse` -> `fieldsFromExampleText()` (`cli/src/payload.js:62`) ->
  `flattenExample()` turns nested JSON into dotted rows:
  ```json
  { "paymentInfo": { "id": "x", "status": "ok" } }
  ```
  becomes the rows `paymentInfo`, `paymentInfo.id`, `paymentInfo.status` - and `payload.example`
  keeps the original object.
- **Manual field editor**: add/edit/remove rows `{ name (dotted ok), type, required, description }`.
  `showReconstructedJson()` runs `buildExampleFromFields()` so the user sees the nested JSON their
  rows will produce.
- **Mark as "no request body"**: `payload.hasBody = false` clears fields + example.

End shape per body endpoint:
```js
{
  hasBody: true,
  fields:  [ { name: 'paymentInfo.id', type: 'string', required: true, description: '' } ],
  example: { paymentInfo: { id: 'x' } }   // optional
}
```

### Step 6 - Preview (`cli/src/steps/preview.js`)

- Builds the draft with `buildConfig(state)` (`cli/src/api.js:123`) and POSTs it to
  `/api/integrations/preview` (timeout 30 s).
- Backend handler: `runPreview()` -> `generator.buildPreview(config)` (`generator/src/index.js:19`),
  which runs `buildProjectConfig()` (endpoint analysis -> MCP tools, ports, auth env contract).
- Response stored as `state.preview` and rendered:
  - ports (`mcpServer`, `aiServer`), tool count, model
  - a table of tools: `name`, `description`, `request` (`METHOD /path`)
  - the environment contract (`state.preview.auth.env.lines`) + `GROQ_API_KEY=` hint
- On failure: `askAfterFailure()` offers Retry / Back / Quit.

Important for step 7: the tools computed here are **re-used** by generation
(`state.preview.tools` is attached to the generate payload) so the generated project and the preview
always agree.

### Step 7 - Generate (`cli/src/steps/generate.js`)

1. `config = buildConfig(state)`, then `config.tools = state.preview?.tools`.
2. `POST /api/integrations/generate` (timeout 20 s) -> backend `enqueueGeneration()`:
   - `Integration.create(...)` - the full draft (name, URLs, auth metadata, ai, endpoints **with
     payloads**, tools) - `status: 'generating'`
   - `GenerationJob.create(...)` - `status: 'queued'`, 7 steps all `pending`:
     `validate -> analyze -> mcp -> ai-server -> ai-chat -> docs -> zip`
   - `runJob(jobId)` fires in the background (same process, fire-and-forget) and updates MongoDB at
     each step.
   - Responds `202 accepted` with `{ integration, job }`; the CLI stores
     `state.generation = { integrationId, job, project: null }`.
3. Polling loop (every 2 s, `sleep(2000)`):
   - `GET /api/integrations/:id/status` -> `{ integration, job, project }`; the current step label is
     printed through the spinner (`currentStepLabel(job)` reads `job.currentStep`/`steps[]`).
   - `job.status === 'completed'` -> break, render the done steps.
   - `job.status === 'failed'` -> print `job.error` + failed step detail; Retry resets
     `state.generation = null` and starts a fresh job.

### Step 8 - Download (`cli/src/steps/download.js`)

1. `multiselect` of packages: `complete | mcp-server | ai-server | ai-chat` (labels from `PACKAGES`).
2. Target folder: `state.downloadDir || path.join(process.cwd(), slug)` where
   `slug = state.generation.project.projectName || slugify(state.name)`.
3. Per selected package: `GET /api/integrations/:id/download?package=<kind>` ->
   backend `resolveArtifact()` looks up `GeneratedProject` (mapping integrationId -> file names),
   checks the ZIP exists under the artifacts dir, and streams it with
   `fs.createReadStream(...).pipe(res)` (`Content-Length` + zip headers).
   The CLI buffers the body (`downloadZip()` in api.js) and writes `<slug>-<kind>.zip` to the folder.
4. Optional local extraction: `extractZip()` uses `Expand-Archive` on Windows, `tar -xzf` elsewhere.
5. `'again'` (create another) resets state via `Object.assign(state, createState())` and restarts at
   step 0; otherwise the wizard exits with the outro message.

---

## 5. Data that leaves the CLI (API contract, `cli/src/api.js`)

All requests use the base URL from `API_URL || BACKEND_URL || 'http://localhost:4000'`
(api.js:5-9) and are unwrapped by `apiFetch()`:

- success: `{ success: true, data }` -> returns `data`
- failure: throws `ApiError` from `{ success: false, error: { code, message } }`
- abort/timeout -> `TIMEOUT`; network failure -> `NETWORK_ERROR` ("Cannot reach the API at ...")

**Auth is split into two payloads:**

| Builder             | Contents                                   | Sent to                              |
| ------------------- | ------------------------------------------ | ------------------------------------ |
| `transientAuth()`   | **real credentials** (token, header value, password) | live test only (`/discover`) |
| `metaAuth()`        | type + header names, `configured` flag - **no secrets** | `/preview`, `/generate`      |

**`buildConfig(state)`** - the single draft used by preview AND generate:

```js
{
  name:        'Acme Assistant',
  appUrl:      'https://acme.com',
  apiBaseUrl:  'https://api.acme.com/api',
  auth:        { type: 'bearer', configured: true },        // metaAuth, no token
  ai:          { provider: 'groq', model: 'openai/gpt-oss-120b' },
  discovery:   { ... } | undefined,                          // set only after a live test
  endpoints: [ ...with endpoint.payload attached... ]        // endpointsWithPayloads()
}
```

`endpointsWithPayloads()` (api.js:115) maps each endpoint to
`{ ...endpoint, payload: state.payloads[endpointKey(endpoint)] }` - so payloads travel **inside**
the endpoint objects.

---

## 6. Wire flow behind steps 6-8 (backend + MongoDB)

Relevant files: `backend/src/services/generation.service.js`, `backend/src/services/integration.service.js`,
`backend/src/controllers/integration.controller.js`, models in `backend/src/models/`.

```
POST /api/integrations/preview
   -> runPreview(config) -> generator.buildPreview(config)   // pure compute, no DB
   -> { projectName, ports, auth.env, ai, tools, mcp, ... }

POST /api/integrations/generate
   -> enqueueGeneration(draft)
        -> Integration.create(...)                            // Mongo: endpoints + tools stored
        -> GenerationJob.create({ status:'queued', steps:[7x pending] })
        -> Integration.jobId = job._id
        -> runJob(jobId)   // background, fire-and-forget
             validate: generator.validateApi(target, timeout)      -> step 0 done
             analyze:  generator.analyzeEndpoints(endpoints)       -> step 1 done, tools mapped
             generate: generator.generateProject(config)
                       (renders templates, writes .env.example/docs,
                        zipDirectory() zlib level 9, sha256OfFile)
                       -> steps 2-5 done
             GeneratedProject.findOneAndUpdate({ ...upsert })      // file names + sizes
             -> step 6 (zip) done, job.status='completed', integration.status='ready'
        failure path: job.status='failed' + job.error + step detail

GET /api/integrations/:id/status     (polled every 2 s by the CLI)
   -> Integration.find + GenerationJob.find + GeneratedProject.find
   -> { integration:{name,status}, job:{status,steps,currentStep,error,result}, project:{...} }

GET /api/integrations/:id/download?package=complete|...
   -> GeneratedProject -> artifacts[packageKey].fileName -> fs.createReadStream(zip)
```

MongoDB models used (`backend/src/models/`):

| Model              | Role                                                          |
| ------------------ | ------------------------------------------------------------- |
| `Integration`      | draft config: name/urls/auth/ai/endpoints(+payloads)/tools, `status` |
| `GenerationJob`    | queued/running/completed/failed + 7 step rows - drives the progress UI |
| `GeneratedProject` | artifact metadata (which ZIPs exist, sizes) - resolves downloads |

---

## 7. End-to-end worked example

User runs `ai-generate` against `https://api.acme.com/api` with `GET /users` + `POST /users`:

1. **Step 1** - `state = { name: 'Acme', appUrl: 'https://acme.com', apiBaseUrl: 'https://api.acme.com/api', ... }`
2. **Step 2** - bearer token -> `state.auth = { type: 'bearer', token: 'tok_abc' }`
3. **Step 3** - no change; `state.ai` stays `{ provider: 'groq', model: 'openai/gpt-oss-120b' }`
4. **Step 4** - file `routes.txt` with `GET /users` / `POST /users` -> `parseRouteFile` ->
   `state.endpoints = [{ method:'GET', path:'/users' }, { method:'POST', path:'/users' }]`
   (live test optional: `transientAuth` sends the real token to `/discover` only)
5. **Step 5** - editor for `POST /users`; user pastes `{ "name": "John" }` ->
   `state.payloads['POST /users'] = { hasBody: true, fields: [{ name:'name', type:'string', ... }], example: { name:'John' } }`
6. **Step 6** - `buildConfig` -> `POST /preview` -> backend `buildPreview` maps 2 MCP tools
   (`get_users`, `create_user` + inputSchema built from the payload fields) -> `state.preview`
7. **Step 7** - same config + `config.tools = state.preview.tools` -> `POST /generate` ->
   Mongo records Integration + queued GenerationJob -> `runJob` validates/analyzes/renders 4 zips ->
   CLI polls `/status` every 2 s until `completed` -> `state.generation = { integrationId, job, project }`
8. **Step 8** - picks `complete` -> `GET /:id/download?package=complete` -> ZIP streamed to
   `<cwd>/acme-complete.zip`, optionally extracted locally.

The extracted project contains `mcp-server/` (tools.js + generic executor), `ai-server/`
(Groq + SSE), `ai-chat/AiChat.jsx`, README + docker-compose - fully standalone.

---

## 8. Local transformations (no network)

| File                  | Function(s)                      | What happens                                                     |
| --------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `cli/src/routeParser.js` | `parseRouteFile()`             | text -> `[{ method, path }]` via 3 regexes (Express/decorator/plain/bare) |
| `cli/src/payload.js`  | `flattenExample()`                | example JSON -> dotted `{ name, type }` rows (nested kept)       |
|                       | `buildExampleFromFields()`        | dotted rows -> nested JSON (for the "reconstructed payload" view) |
|                       | `expandFields()`                  | dotted rows -> nested JSON Schema `{ properties, required }` (consumed by the generator for the MCP tool body schema) |
| `cli/src/paths.js`    | `resolveFilePath()`               | fuzzy file path resolution (cwd -> repo root -> `~` -> quote strip) |
| `cli/src/table.js`    | `renderTable()`, `slugify()`      | terminal tables; `slug` used for download file names             |
| `cli/src/ui.js`       | prompts/spinner/stepHeader        | all terminal I/O - `promptOrCancel` handles Ctrl+C               |

---

## 9. File reference map (`cli/`)

```
cli/src/index.js              master loop, help/version, navigation
cli/src/state.js              step definitions + createState() + endpointKey()
cli/src/api.js                API_URL resolution, apiFetch, transientAuth/metaAuth,
                              endpointsWithPayloads, buildConfig, downloadZip
cli/src/ui.js                 clack wrappers, banner, stepHeader, tracker line
cli/src/paths.js              file path resolution
cli/src/routeParser.js        .txt route parsing
cli/src/payload.js            payload flatten / rebuild / schema expansion
cli/src/table.js              table rendering + slugify
cli/src/steps/application.js  Step 1
cli/src/steps/authentication.js Step 2
cli/src/steps/ai.js           Step 3
cli/src/steps/discovery.js    Step 4 (file import, live discover, manual)
cli/src/steps/payload.js      Step 5 (per-endpoint payload editor)
cli/src/steps/preview.js      Step 6 (POST /preview)
cli/src/steps/generate.js     Step 7 (POST /generate + status polling)
cli/src/steps/download.js     Step 8 (download + extract)
```

---

## 10. Current constraints and the local-mode plan

- **The package cannot generate anything by itself today** - steps 6-8 require the backend on
  `API_URL` (default `http://localhost:4000`), which itself requires MongoDB. Without them the CLI
  stops at "Cannot reach the API at ...".
- **No persistence between runs** - state lives only in memory; a crash means re-entering steps 1-5.
- **Planned change for standalone use**: make `@aig/generator` (published) a dependency of the CLI
  and call `buildPreview()`, `validateApi()`, `analyzeEndpoints()`, `generateProject()` directly on
  the user's machine; `download` becomes a local file copy. Then `npx ai-integration-generator-cli`
  works fully offline with zero servers.
