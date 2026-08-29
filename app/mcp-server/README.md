# myApp - MCP Server

Exposes the **myApp** API (`http://localhost:8100`) as Model Context Protocol tools and resources, so any MCP client (Claude Desktop, Cursor, the generated AI server, ...) can work with your application data.

## Architecture

```
MCP Client (e.g. AI Server)
        |
        | JSON-RPC (Streamable HTTP)
        v
   MCP Server (this service)  :5000
        |
        | API Adapter (env-driven)
        v
   myApp API : http://localhost:8100
```

Every tool funnels through the **API Adapter** (`src/adapters/api-adapter.js`): base URL, authentication, headers, query parameters, request bodies, timeouts and error handling all live there and are configured exclusively through environment variables.

## Available tools (15)

| Tool | Description |
| --- | --- |
| `get_api_v1_user` | Retrieves user from the target API via GET /api/v1/user. |
| `get_api_v1_user__id` | Retrieves $id from the target API via GET /api/v1/user/${id}. |
| `get_api_v1_products` | Retrieves products from the target API via GET /api/v1/products. |
| `get_api_v1_products__id` | Retrieves $id from the target API via GET /api/v1/products/${id}. |
| `create_api_v1_cart` | Creates cart from the target API via POST /api/v1/cart. Payload format: { product: string, user: string, quantity: number }. |
| `get_api_v1_cart` | Retrieves cart from the target API via GET /api/v1/cart. |
| `get_api_v1_cart__userId` | Retrieves $userId from the target API via GET /api/v1/cart/${userId}. |
| `delete_api_v1_cart__id` | Deletes $id from the target API via DELETE /api/v1/cart/${id}. |
| `delete_api_v1_cart__userId` | Deletes $userId from the target API via DELETE /api/v1/cart/${userId}. |
| `update_api_v1_cart__id` | Updates a $id from the target API via PUT /api/v1/cart/${id}. Payload format: { product: string, user: string, quantity: number }. |
| `create_api_v1_order` | Creates orders from the target API via POST /api/v1/orders. Payload format: {"product":["6689163bb32037101ed659ed","66970a1708450baa9fb9c08d"],"user":"6a7d7e2939cf8829be3874ef","quantity":2,"paymentInfo":{"id":"payment_id","status":"payment_status","paidAt":"2026-08-15T06:12:44.696Z","itemsPrice":"1899.00","taxPrice":"0","shippingPrice":"50.00","totalPrice":"1949.00"}}. |
| `get_api_v1_category` | Retrieves category from the target API via GET /api/v1/category/. |
| `get_api_v1_category__id` | Retrieves $id from the target API via GET /api/v1/category/${id}. |
| `create_api_v1_inbox` | Creates inbox from the target API via POST /api/v1/inbox. Payload format: { email: string, message: string, user: string }. |
| `get_api_v1_inbox` | Retrieves inbox from the target API via GET /api/v1/inbox. |

## Getting started

```bash
npm install
cp .env.example .env     # then fill in your credentials below
npm run dev              # or: npm start
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `MCP_SERVER_PORT` | Port the MCP server listens on (default `5000`) |
| `TARGET_API_BASE_URL` | Base URL of the myApp API |
| `TARGET_API_AUTH_TYPE` | `none`, `bearer`, `api-key`, `custom-header` or `basic` |
- No authentication is configured - the generated server calls the API without credentials
| `TARGET_API_TIMEOUT_MS` | Timeout for target API calls (default `10000`) |

Secrets are read from your local `.env` - never commit these values.

## Testing the MCP server

```bash
# Is the server up?
curl http://localhost:5000/health

# Minimal Streamable HTTP exchange (initialize + list tools)
curl -X POST http://localhost:5000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

## Calling a tool

```js
// With any MCP client SDK:
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": { "name": "get_users", "arguments": {} }
}
```

## Customizing tools

Open `src/config/tools.js` - it is a plain data registry. Add or change a tool by editing its entry (name, description, inputSchema, request). The executor (`src/services/endpoint.service.js`) needs no changes.

## Troubleshooting

- **401/403 responses** - check `TARGET_API_AUTH_TYPE` and the credentials in `.env`
- **Tool says "target API unreachable"** - check `TARGET_API_BASE_URL` and network access from this container/host