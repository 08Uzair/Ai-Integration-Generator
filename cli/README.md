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

The CLI is a client of the **AI Integration Generator backend API** (same one the web wizard uses). Steps 6–8 (Preview, Generate, Download) need that backend reachable:

| Service | Address |
| ------- | ------- |
| Backend API | `http://localhost:4000` (start with `npm run dev:backend`) |
| MongoDB | `localhost:27017` (required by the backend) |

> Point the CLI at any hosted backend instance with the `API_URL` environment variable:
> ```powershell
> $env:API_URL = "https://your-backend.example.com"; ai-generate
> ```

## The 8 steps

| Step | What happens in the terminal |
| ---- | ---------------------------- |
| 1. Application | Project name, app URL, API base URL |
| 2. Authentication | `none / bearer / api-key / custom-header / basic` (secrets are masked, never stored) |
| 3. AI Configuration | Fixed provider/model (Groq + `openai/gpt-oss-120b`) |
| 4. API Discovery | Point at a `.txt` file with your endpoints — routes are parsed automatically (`GET /users`, `router.get('/x')`, `@app.post('/x')`, bare `/x` lines) and shown in a table; manual add/remove and an optional live connection test are also available |
| 5. Request Payloads | Per POST/PUT/PATCH endpoint: paste a JSON example and it is flattened into a payload table — **nested objects are fully expanded** (`paymentInfo.id`, `paymentInfo.status`, ...), with add / edit / remove / required / description per row |
| 6. Preview | Shows tools, ports and the environment contract |
| 7. Generate | Starts the background job and tracks progress live |
| 8. Download | Downloads the ZIP package(s) of your choice and can extract them locally |

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

See the repository at https://github.com/08Uzair/CUSTOM-MCP for the backend and the full project.
