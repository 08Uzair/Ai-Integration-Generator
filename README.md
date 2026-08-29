<div align="center">

<pre>
   █████╗   ██╗    ██████╗
  ██╔══██╗  ██║   ██╔════╝
  ███████║  ██║   ██║  ███╗
  ██╔══██║  ██║   ██║   ██║
  ██║  ██║  ██║   ╚██████╔╝
  ╚═╝  ╚═╝  ╚═╝    ╚═════╝

</pre>

<h1>⚡ AI Integration Generator</h1>

**Turn any existing API into a fully working AI assistant.**

MCP server · AI chat backend · Drop-in chat UI — generated in minutes, **zero code required**.

<br>

[![npm version](https://img.shields.io/npm/v/ai-integration-generator-cli?color=%236366f1&label=npm&logo=npm)](https://www.npmjs.com/package/ai-integration-generator-cli)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-ready-4DB33D?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-Streamable%20HTTP-7c3aed)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/license-MIT-22d3ee)](<>)

**Try it right now:**

```bash
npx ai-integration-generator-cli
```

</div>

---

## 📑 Contents

|                                            |                                                |                                        |
| ------------------------------------------ | ---------------------------------------------- | -------------------------------------- |
| [✨ What is this?](#what-is-this)          | [🎯 Why? (The problem)](#why-the-problem)      | [🚀 Key features](#key-features)       |
| [🏗️ How it works](#how-it-works)           | [🧰 Tech stack](#tech-stack)                   | [🛠️ Quick start](#quick-start)         |
| [🧙 The 8-step wizard](#the-8-step-wizard) | [📦 What you get](#what-you-get)               | [📡 Backend API](#backend-api)         |
| [🔒 Security](#security)                   | [⚙️ Development scripts](#development-scripts) | [🆘 Troubleshooting](#troubleshooting) |

---

## What is this?

A platform that **scans any existing application or API** and generates a **fully working, standalone AI integration project** — an **MCP server**, an **AI chat server** and a single drop-in chat component (`AiChat.jsx`) — plus Docker configuration and documentation, all packaged as a ZIP you can download and run on its own.

Everything is driven by the same **8-step wizard** through two front doors:

| 🖥️ Web wizard                                                        | 💻 Terminal wizard                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Next.js UI at `http://localhost:3000` — forms, tables, progress bars | Interactive CLI (`ai-generate`) — create-vite style diamonds, spinners and tables |

> [!NOTE]
> The generated project is **100% standalone** — it never depends on this platform again.

---

## Why? (The problem)

Adding AI to an existing app so users can ask questions like _"how many orders did customer X place last month?"_ requires:

| 😫 The hard way (by hand)                                   | ⚡ The easy way (this platform)                   |
| ----------------------------------------------------------- | ------------------------------------------------- |
| Manually teach the LLM every endpoint, method and parameter | Endpoints are imported and analyzed automatically |
| Wire tools through the **Model Context Protocol** yourself  | MCP tool registry generated from your endpoints   |
| Build a chat backend with streaming + tool execution        | Ready-made SSE chat server (Groq)                 |
| Build and integrate a chat UI                               | `AiChat.jsx` — copy & drop                        |
| Configure auth, `.env`, docs, Docker                        | All generated for you                             |

**Days of work → minutes of wizard time.**

---

## Key features

| ⚡ Zero-code generation                                         | 🧠 MCP-native                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Endpoints + payloads become real, typed MCP tools automatically | Tools are pure **data** (`tools.js`), executed by one generic adapter — never an open HTTP proxy |

| 📄 Route file import                                                                                                              | 🪆 Nested payloads                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Point at a `.txt`/`.js`/`.ts` file — `GET /users`, `router.get('/x')`, `@app.post('/x')` and bare `/x` lines are parsed instantly | Paste JSON; every child field becomes a table row (`paymentInfo.id`, `paymentInfo.status`, ...) and the generated schema keeps the nested shape |

| 🔍 Live discovery                                            | 🕐 Background generation                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Probe your API, detect JSON/OpenAPI, auto-discover endpoints | Validating → Analyzing → Rendering → Zipping, tracked step by step |

| 🔒 Secure by default                                                    | 📦 Publishable CLI                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------- |
| SSRF guard, secrets never persisted, ZIP hardening, 24h artifact expiry | `npm i -g ai-integration-generator-cli` → `ai-generate` |

---

## How it works

```
 ┌──────────────────────────┐
 │ WIZARD  (web :3000)  OR  │   ← your config: appUrl, apiBaseUrl,
 │ WIZARD  (terminal CLI)   │     auth, ai, endpoints + payloads
 └────────────┬─────────────┘
              │ HTTP
              ▼
 ┌──────────────────────────┐
 │ BACKEND API  (:4000)     │   validate → discover → preview → generate
 └─────┬────────────┬───────┘
       │            │ enqueue job
       ▼            ▼
 ┌────────────┐  ┌─────────────┐    ┌──────────────────┐
 │ TARGET API │  │  MONGODB    │    │  GENERATOR       │
 │ (your app) │◄─┤  (:27017)   │◄───┤  template engine │
 └────────────┘  └─────────────┘    └────────┬─────────┘
                                             ▼
                               ZIP artifacts (complete + per-service)
                                             │ download
                                             ▼
                          GENERATED PROJECT (runs on its own)
```

**Plain English walkthrough:**

1. **Wizard** (web or terminal) collects your API details and endpoints.
2. **Backend API** validates everything, stores the job and hands it to the **generator**.
3. **Generator** converts each endpoint into an MCP tool and renders the project from templates.
4. **MongoDB** tracks integrations, jobs and generated artifacts.
5. You **download** the ZIP.
6. The **generated project** runs by itself: MCP server talks to _your_ API, AI server lets Groq call those tools, and `AiChat.jsx` renders the chat in your app.

<details>
<summary><b>🔬 Deep dive — full vertical flow & code examples</b></summary>

```
┌───────────────────────────────────────────────────────────────────┐
│ 1. WIZARD UI            frontend/            http://localhost:3000 │
│    StepApplication ──> StepAuthentication ──> StepAI ──>          │
│    StepDiscovery ──> StepPayload ──> StepPreview ──> StepGenerate  │
│    ──> StepDownload                                               │
└──────────────────────────────┬────────────────────────────────────┘
                               │  user config: { appUrl, apiBaseUrl, auth, ai }
                               │  apiFetch('/api/integrations/validate', ...)
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│ 2. BACKEND API           backend/            http://localhost:4000 │
│    express + zod + rate-limit + SSRF guard                        │
│    POST /api/integrations/validate | /discover | /preview          │
│    POST /api/integrations/generate  | GET  /:id | /:id/status      │
│    GET  /:id/download?package=complete|ai-server|mcp-server|...    │
└───────────────┬──────────────────────┬─────────────────────────────┘
                │ validateApi()        │ generate → enqueueGeneration()
                │ (safe-fetch, SSRF)   ▼
                ▼              ┌──────────────────────────────────────┐
┌──────────────────────┐      │ 4. MONGODB  (localhost:27017)        │
│ 3. TARGET APP / API  │      │    Integration { endpoints, tools }  │
│    e.g. :3005        │◄─────┤    GenerationJob { steps[] }          │
└──────────────────────┘      │    GeneratedProject { artifacts }     │
                              └───────────────┬──────────────────────┘
                                              │ runJob() background
                                              ▼
┌───────────────────────────────────────────────────────────────────┐
│ 5. GENERATOR            generator/src/services/generation.service │
│    validate ──> analyzeEndpoints ──> generateProject               │
│    buildProjectConfig() ──> buildTokens() ──> renderTemplate()     │
│    (ai-server, mcp-server, ai-chat, project-docs)                   │
│    writeEnvExamples() ──> zipDirectory() + sha256OfFile()          │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ acme-crm-complete.zip (+ per-service)
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│ 6. DOWNLOAD  browser ← GET /api/integrations/:id/download         │
│    unzip → .env: TARGET_API_BASE_URL, GROQ_API_KEY, MCP_SERVER_URL │
└──────────────────────────────┬─────────────────────────────────────┘
                               ▼   GENERATED RUNTIME (independent)
┌───────────────────────────────────────────────────────────────────┐
│ 7. GENERATED PROJECT                                             │
│                                                                   │
│    mcp-server (Express :5000)  ◄── JSON-RPC ──  ai-server (:4100)  │
│      │ tools: get_users,                                           │
│      │        create_user,      ◄── HTTP ──  groq (LLM)            │
│      │        get_user,                                           │
│      │        update_user,          SSE chat                       │
│      │        delete_user            ▲                             │
│      │ resources: api://info        │                             │
│      ▼                              │                             │
│    TARGET API (real data) ──────────┘   AiChat.jsx (in your app)    │
│    http://localhost:3005/users/3                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Wizard → API** (`frontend/lib/api.js`):

```js
export async function apiFetch(path, { method = 'GET', body, params, timeoutMs } = {}) {
  const url = params
    ? `${API_URL}${path}?${new URLSearchParams(params)}`
    : `${API_URL}${path}`;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs || 30000),
  });
  // unwraps { success, data } / { success, error } envelopes
}
```

**Background job** (`backend/src/services/generation.service.js`):

```js
await setStep(job, 1, 'running');
const analysis = await generator.analyzeEndpoints(config.endpoints, {
  allowedPrivateHosts: [],
});
config.tools = analysis.tools; // { name, description, inputSchema, request }[]
await setStep(job, 1, 'completed', `${analysis.tools.length} tool(s) mapped`);

const result = await generator.generateProject(config); // renders + zips
```

**Generated AI chat loop** (`generated <project>/ai-server/src/services/chat.service.js`):

```js
const completion = await this.provider.complete({
  messages: current,
  tools: this.mcp.aiToolList(),
});
if (!completion.toolCalls?.length) {
  await this.#streamFinal(current, emit); // stream final answer (SSE deltas)
} else {
  for (const call of completion.toolCalls) {
    executed = await this.mcp.callTool(call.name, call.arguments); // JSON-RPC → MCP server
  }
}
```

</details>

---

## Tech stack

| Layer                | Technology                                                                        | Where                   |
| -------------------- | --------------------------------------------------------------------------------- | ----------------------- |
| Backend API          | Node.js (ESM) · Express 4 · Mongoose · Zod · Helmet · express-rate-limit · morgan | `backend/`              |
| Generator            | Node.js (ESM) · `@modelcontextprotocol/sdk` · archiver · custom template engine   | `generator/`            |
| Wizard UI            | Next.js 14 (App Router) · React 18 · Tailwind CSS · lucide-react                  | `frontend/`             |
| Terminal wizard      | Node.js (ESM) · `@clack/prompts` · cli-table3 · chalk — create-vite style         | `cli/`                  |
| Storage              | MongoDB — `mongodb://localhost:27017/ai_integration_generator`                    | local mongod            |
| Generated MCP Server | `@modelcontextprotocol/sdk` — Streamable HTTP transport, generic tool executor    | generated `mcp-server/` |
| Generated AI Server  | Express + SSE + Groq (OpenAI-compatible streaming)                                | generated `ai-server/`  |
| Generated AI Chat    | `AiChat.jsx` — React 18+, `react-markdown` + `lucide-react` + Tailwind, SSE       | generated `ai-chat/`    |

| Port    | Service                                                |
| ------- | ------------------------------------------------------ |
| `3000`  | Wizard (platform frontend) — http://localhost:3000     |
| `4000`  | Backend API — http://localhost:4000/api/health         |
| `27017` | MongoDB                                                |
| `5000`  | Generated MCP server — http://localhost:5000/mcp       |
| `4100`  | Generated AI server — http://localhost:4100/api/health |

```
├── backend/       Express REST API + job pipeline (validation, discovery, generation, zip, download)
├── generator/     Rendering engine: endpoint analysis → MCP tool definitions → template rendering → ZIP
├── frontend/      Next.js wizard (8 steps) + dashboard/installed integrations
├── cli/           Terminal wizard (8 steps, @clack/prompts) — talks to the same backend API
│   └── src/steps/ one file per wizard step (application, authentication, ... download)
├── app/           sample target application used for local testing (port 3005)
├── generated/     ZIP artifacts (git-ignored)
├── run.ps1        one-command startup script (also: .\run.ps1 -Cli for the terminal wizard)
└── docker-compose.yml
```

---

## Quick start

### Prerequisites

- **Node.js ≥ 18.17** — `node -v`
- **MongoDB** running on `localhost:27017` — check with:
  ```powershell
  Test-NetConnection localhost -Port 27017
  ```
  Not installed? Grab [MongoDB Community Server](https://www.mongodb.com/try/download/community) (installs as a Windows service).
- **Groq API key** — only needed for live AI answers from a _generated_ project (never asked or stored here; goes into the generated `ai-server/.env`).

> [!IMPORTANT]
> The backend **will not work** without MongoDB. Start it first (`mongod` or the MongoDB service).

### 🚀 One-command launcher: `run.ps1`

The repository ships a PowerShell launcher that starts every service from **one terminal** — no need to juggle multiple windows.

| Command                   | What it does                                                    |
| ------------------------- | --------------------------------------------------------------- |
| `.\run.ps1 -Install`      | **First time only** — installs dependencies for all workspaces  |
| `.\run.ps1`               | Starts backend (:4000) + web wizard (:3000) together            |
| `.\run.ps1 -Dev`          | Same as above, but the backend **auto-restarts on file change** |
| `.\run.ps1 -Cli`          | Starts backend (:4000) + launches the **terminal wizard**       |
| `.\run.ps1 -Cli -Install` | Installs everything, then launches the terminal wizard          |
| `.\run.ps1 -Stop`         | Stops every service and frees ports 3000/4000                   |

**How it behaves:**

- Runs each service as a background job and prints all output **with timestamps** in the same terminal, e.g. `[12:00:01][BACKEND] Listening on :4000`.
- **MongoDB check** — prints a warning if port 27017 is not reachable (the backend will fail without it).
- Stops everything on <kbd>Ctrl</kbd>+<kbd>C</kbd>, or on demand from any terminal with `.\run.ps1 -Stop`.
- Also kills leftover `node`/`npm` processes that belong to this project and anything still listening on ports 3000/4000 — a clean slate every time.

> [!TIP]
> If PowerShell blocks the script, allow it once:
>
> ```powershell
> powershell -ExecutionPolicy Bypass -File .\run.ps1
> ```

### 🖥️ Option A — Web wizard, one command (recommended)

```powershell
.\run.ps1 -Install    # first time only
.\run.ps1             # starts backend (:4000) + wizard (:3000)
```

Open **http://localhost:3000** → wizard → 8 steps → download.

Stop with <kbd>Ctrl</kbd>+<kbd>C</kbd> or `.\run.ps1 -Stop`.

### 🖥️ Option B — Web wizard, manually

```powershell
# Terminal 1 — Backend API (:4000)
cd backend
npm install        # first time only
npm run dev

# Terminal 2 — Wizard frontend (:3000)
cd frontend
npm install        # first time only
npm run dev
```

### 💻 Terminal wizard (CLI)

```powershell
# From this repo — backend + CLI in one command
.\run.ps1 -Cli              # first time: .\run.ps1 -Cli -Install

# Or with the backend already running:
npm run cli

# Or as a global package (shareable):
npm install -g ai-integration-generator-cli
ai-generate
```

> [!TIP]
> Point the CLI at a **hosted backend** instead of localhost:
>
> ```powershell
> $env:API_URL = "https://your-backend.example.com"; ai-generate
> ```

The terminal experience looks like this:

```
   █████╗   ██╗    ██████╗
  ██╔══██╗  ██║   ██╔════╝
  ███████║  ██║   ██║  ███╗
  ██╔══██║  ██║   ██║   ██║
  ██║  ██║  ██║   ╚██████╔╝
  ╚═╝  ╚═╝  ╚═╝    ╚═════╝
...
┌  AI Integration Generator
│  Generate a customized AI Server, MCP Server, AI Chat Client and docs...
│  ✓ App  ✓ Auth  ✓ AI  ✓ Endpoints  ◆ Payloads  ○ Preview  ○ Generate  ○ Download
┌  Step 5/8 · Request Payloads
│  ◆  POST /orders — payload editor:
│  ●  Apply JSON example (auto-fill all fields, including nested)
│  ○  Add field manually
│  ○  Done
```

---

## The 8-step wizard

| #   | Step                 | What you provide                                                | Web                 | Terminal                  |
| --- | -------------------- | --------------------------------------------------------------- | ------------------- | ------------------------- |
| 1️.  | **Application**      | Project name, app URL (optional), API base URL                  | Forms               | Text prompts              |
| 2️.  | **Authentication**   | `none / bearer / api-key / custom-header / basic` + credentials | Dropdown + inputs   | Select + masked inputs    |
| 3️.  | **AI Configuration** | Fixed: Groq + `openai/gpt-oss-120b`                             | Read-only panel     | Read-only bullets         |
| 4️.  | **API Discovery**    | Endpoints: live test, `.txt` route file, or manual              | Table + file upload | Table + file path         |
| 5️.  | **Request Payloads** | JSON payload per POST/PUT/PATCH endpoint — nested supported     | Editor + JSON paste | Table editor + JSON paste |
| 6️.  | **Preview**          | Review tools, ports, env contract                               | Cards + tool list   | Tables + env box          |
| 7️.  | **Generate**         | Watch live progress                                             | Progress bar        | Spinner + step list       |
| 8️.  | **Download**         | Pick packages + destination                                     | Browser download    | Folder + optional extract |

### 📄 Step 4 — endpoints file

```txt
GET /users
POST /users
GET /users/:id
PUT /users/:id
DELETE /users/:id
POST /orders
router.get('/products', listProducts)     # Express-style lines also work
@app.post('/categories')                  # decorator style too
```

Parsed into a table automatically. Paths are resolved smartly: current folder → repo root → `~` → quoted paths; if not found, the error lists every location tried.

### 🪆 Step 5 — nested payloads

Paste this:

```json
{
  "product": ["6689163bb32037101ed659ed"],
  "user": "6a7d7e2939cf8829be3874ef",
  "quantity": 2,
  "paymentInfo": {
    "id": "payment_id",
    "status": "payment_status",
    "itemsPrice": "1899.00",
    "totalPrice": "1949.00"
  }
}
```

Get these rows — **every child field included**:

```
product               array
user                  string
quantity              number
paymentInfo.id        string
paymentInfo.status    string
paymentInfo.itemsPrice string
paymentInfo.totalPrice string
```

And the generated MCP tool schema keeps the same **nested** shape.

---

## What you get

```
<project>/
├── ai-server/         Express SSE chat API: Groq ──> MCP tools
├── mcp-server/        Streamable HTTP MCP server (tools + api://info resource)
├── ai-chat/           AiChat.jsx drop-in component + INSTALL.md
├── README.md          project documentation
├── docker-compose.yml both servers containerized
└── .env.example       one per service (secrets always empty)
```

Tool naming follows a fixed spec:

```
GET /users          -> get_users        GET /users/:id      -> get_user
POST /users         -> create_user      PUT /users/:id      -> update_user
DELETE /users/:id   -> delete_user
```

> [!NOTE]
> The MCP server is a **generic executor over a pure-data tool registry** — tools are data, not code, so the generated server can never degrade into an unrestricted HTTP proxy.

### ▶️ Run the generated project

```powershell
# 1. Unzip the project (or use the CLI's "extract" option)

# 2. Install dependencies per service
cd <project>/ai-server && npm install
cd ../mcp-server && npm install

# 3. Create .env files and fill in real values
#    ai-server/.env:  GROQ_API_KEY=..., MCP_SERVER_URL=http://localhost:5000/mcp
#    mcp-server/.env: TARGET_API_BASE_URL=..., plus auth values if configured

# 4. Start the servers (two terminals)
cd <project>/mcp-server && npm run dev       # MCP server on :5000
cd <project>/ai-server   && npm run dev      # AI server on :4100

# 5. Drop AiChat.jsx into your app (see <project>/ai-chat/INSTALL.md)
```

Or with Docker: `docker compose up`

<details>
<summary><b>🔬 Generated tool registry (example)</b></summary>

```js
export const TOOLS = [
  {
    name: 'get_user',
    description: 'Retrieves a user from the target API via GET /users/{id}.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Value for the :id path parameter' },
      },
      required: ['id'],
    },
    request: {
      method: 'GET',
      path: '/users/{id}',
      pathParams: null,
      queryParams: [],
      body: false,
    },
  },
  // ... create_user, update_user, delete_user, get_users
];
```

</details>

---

## Backend API

All responses use a `{ success, data, message }` envelope (or `{ success, error }` on failure).

| Method   | Endpoint                                                                          | Purpose                                 |
| -------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| `POST`   | `/api/integrations/validate`                                                      | Quick connection preflight              |
| `POST`   | `/api/integrations/discover`                                                      | Deep discovery + endpoint analysis      |
| `POST`   | `/api/integrations/preview`                                                       | Build the full plan (tools, ports, env) |
| `POST`   | `/api/integrations/generate`                                                      | Persist integration + enqueue job       |
| `GET`    | `/api/integrations`                                                               | List recent integrations                |
| `GET`    | `/api/integrations/:id`                                                           | Integration detail (job + artifacts)    |
| `GET`    | `/api/integrations/:id/status`                                                    | Poll job progress                       |
| `GET`    | `/api/integrations/:id/download?package=complete\|ai-server\|mcp-server\|ai-chat` | Download ZIP artifact                   |
| `DELETE` | `/api/integrations/:id`                                                           | Remove integration + artifacts          |

---

## Security

- 🛡️ **SSRF guard** — private/non-HTTP hosts blocked during discovery (`ALLOWED_PRIVATE_HOSTS` override for local dev)
- 🔐 **Secrets never persisted** — `.env.example` ships empty; keys go into the generated `.env`
- 📦 **ZIP hardening** — path-traversal rejection, per-service package isolation
- ⏳ **Artifact expiry** — ZIPs auto-clean after `ARTIFACT_TTL_HOURS` (default 24)

---

## Development scripts

| Command                | What it does                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `.\run.ps1`            | One-command launcher — backend + web wizard ([flag reference](#-one-command-launcher-runps1)) |
| `.\run.ps1 -Cli`       | Backend + terminal wizard                                                                     |
| `.\run.ps1 -Stop`      | Stop all services, free ports 3000/4000                                                       |
| `npm run dev`          | Start backend + frontend together                                                             |
| `npm run dev:backend`  | Backend only (:4000)                                                                          |
| `npm run dev:frontend` | Frontend only (:3000)                                                                         |
| `npm run cli`          | Terminal wizard (needs backend for steps 6–8)                                                 |
| `npm run lint`         | ESLint across all workspaces                                                                  |
| `npm run format`       | Prettier                                                                                      |
| `npm run build`        | Production build of the wizard frontend                                                       |

---

## Troubleshooting

| Symptom                                                         | Cause                   | Fix                                                                                                   |
| --------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Backend won't start                                             | MongoDB not running     | Start `mongod`, verify port 27017                                                                     |
| `Cannot reach the API at http://localhost:4000` (CLI steps 6–8) | Backend not running     | `npm run dev:backend` or `.\run.ps1`, then **Retry** (your data is preserved)                         |
| Port 3000/4000 already in use                                   | Leftover processes      | `.\run.ps1 -Stop`                                                                                     |
| `.\run.ps1` blocked by PowerShell                               | Execution policy        | `powershell -ExecutionPolicy Bypass -File .\run.ps1`                                                  |
| `File not found` for endpoints file (CLI)                       | Wrong resolution folder | Use `./app/routes.txt` (repo-relative) or a full absolute path — the error lists every location tried |
| `No routes detected`                                            | Unsupported syntax      | Plain lines (`GET /users`), Express calls (`router.get('/x')`) or bare paths (`/users`)               |
| AI chat returns errors                                          | Missing `GROQ_API_KEY`  | Create `.env` from `.env.example` and paste your key                                                  |
| Downloads missing after 24h                                     | Artifacts expire        | Re-generate the integration                                                                           |

---

<div align="center">

**Built by Uzer Qureshi for the AI era** — [Report an issue](https://github.com/08Uzair/CUSTOM-MCP/issues) · [npm package](https://www.npmjs.com/package/ai-integration-generator-cli)

</div>
