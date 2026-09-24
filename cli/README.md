# AI Integration Generator CLI

An interactive terminal wizard that generates a **fully working, standalone AI integration project** for any existing API — an **MCP server**, an **AI chat server** and a drop-in **`AiChat.jsx`** chat component — plus Docker configuration and documentation. All 8 steps run right in the terminal, with a modern create-vite / create-next-app style UI (gradient logo, diamond step tracker, guide rails, spinners).

## Install

```bash
npm install -g ai-integration-generator-cli
```

Then run it anywhere:

```bash
ai-generate      # or the shorter alias: aig
```

## How it works

The CLI is **fully standalone** — every part of the pipeline (connection probing, endpoint analysis, MCP tool mapping, project rendering, ZIP creation) runs inside the CLI process through a bundled generation engine. **No backend API and no MongoDB are required** — the only prerequisite is Node.js ≥ 18.

> Everything is generated locally on your machine, in the terminal.

## The 8 steps

| Step | What happens in the terminal |
| ---- | ---------------------------- |
| 1. Application | Project name, app URL, API base URL |
| 2. Authentication | `none / bearer / api-key / custom-header / basic` (secrets are masked, never stored) |
| 3. AI Configuration | Fixed provider/model (Groq + `openai/gpt-oss-120b`) |
| 4. API Discovery | Point at a `.txt` file with your endpoints — routes are parsed automatically (`GET /users`, `router.get('/x')`, `@app.post('/x')`, bare `/x` lines) and shown in a table; manual add/remove and an optional live connection test are also available |
| 5. Request Payloads | Per POST/PUT/PATCH endpoint: paste a JSON example and it is flattened into a payload table — **nested objects are fully expanded** (`paymentInfo.id`, `paymentInfo.status`, ...), with add / edit / remove / required / description per row |
| 6. Preview | Shows tools, ports and the environment contract |
| 7. Generate | Runs the whole generation locally — validating → analyzing → rendering → zipping, tracked live |
| 8. Download | Copies the generated ZIP package(s) of your choice into a folder and can extract them locally |

## Endpoints file

```txt
GET /users
POST /users
GET /users/:id
PUT /users/:id
DELETE /users/:id
POST /orders
router.get('/products', listProducts)
```

Relative paths are resolved against the current directory **and** the repository root, so `./app/routes.txt` works no matter where you launch the CLI. `~` paths and quoted paths (Windows "Copy as path") are handled too.

## Nested payloads

A pasted example like this fills the payload table with every child field:

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

becomes rows `product`, `user`, `quantity`, `paymentInfo.id`, `paymentInfo.status`, `paymentInfo.itemsPrice`, `paymentInfo.totalPrice` — and the generated MCP tool schema keeps the same nested shape.

## Options

```
-v, --version   print the version
-h, --help      show help
```

Environment variables:

- `ALLOWED_PRIVATE_HOSTS` — extra private hosts allowed for connection probes (comma-separated). `localhost` and loopback addresses are already allowed since the CLI runs on your own machine, e.g.:
  ```powershell
  $env:ALLOWED_PRIVATE_HOSTS = "192.168.1.50"; ai-generate
  ```

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

See the repository at https://github.com/08Uzair/Ai-Integration-Generator for the backend and the full project.
