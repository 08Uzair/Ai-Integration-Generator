/**
 * GENERATED - MCP tool registry for myApp.
 *
 * Each entry is pure data describing ONE tool:
 *   - name / description for the AI to understand
 *   - inputSchema (JSON Schema) for argument validation
 *   - request: how to call the target API through the adapter
 *
 * The executor in services/endpoint.service.js stays generic - adding a tool
 * never requires writing code.
 */
export const TOOLS = [
  {
    "name": "get_api_v1_user",
    "description": "Retrieves user from the target API via GET /api/v1/user.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "request": {
      "method": "GET",
      "path": "/api/v1/user",
      "pathParams": null,
      "queryParams": [],
      "body": false
    },
    "payloadGuide": null
  },
  {
    "name": "get_api_v1_user__id",
    "description": "Retrieves $id from the target API via GET /api/v1/user/${id}.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "request": {
      "method": "GET",
      "path": "/api/v1/user/${id}",
      "pathParams": null,
      "queryParams": [],
      "body": false
    },
    "payloadGuide": null
  },
  {
    "name": "get_api_v1_products",
    "description": "Retrieves products from the target API via GET /api/v1/products.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "request": {
      "method": "GET",
      "path": "/api/v1/products",
      "pathParams": null,
      "queryParams": [],
      "body": false
    },
    "payloadGuide": null
  },
  {
    "name": "get_api_v1_products__id",
    "description": "Retrieves $id from the target API via GET /api/v1/products/${id}.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "request": {
      "method": "GET",
      "path": "/api/v1/products/${id}",
      "pathParams": null,
      "queryParams": [],
      "body": false
    },
    "payloadGuide": null
  },
  {
    "name": "create_api_v1_cart",
    "description": "Creates cart from the target API via POST /api/v1/cart. Payload format: { product: string, user: string, quantity: number }.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "body": {
          "type": "object",
          "description": "Request body for POST /api/v1/cart",
          "properties": {
            "product": {
              "type": "string"
            },
            "user": {
              "type": "string"
            },
            "quantity": {
              "type": "number"
            }
          },
          "required": []
        }
      },
      "required": [
        "body"
      ]
    },
    "request": {
      "method": "POST",
      "path": "/api/v1/cart",
      "pathParams": null,
      "queryParams": [],
      "body": true
    },
    "payloadGuide": "{ product: string, user: string, quantity: number }"
  },
  {
    "name": "get_api_v1_cart",
    "description": "Retrieves cart from the target API via GET /api/v1/cart.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "request": {
      "method": "GET",
      "path": "/api/v1/cart",
      "pathParams": null,
      "queryParams": [],
      "body": false
    },
    "payloadGuide": null
  },
  {
    "name": "get_api_v1_cart__userId",
    "description": "Retrieves $userId from the target API via GET /api/v1/cart/${userId}.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "request": {
      "method": "GET",
      "path": "/api/v1/cart/${userId}",
      "pathParams": null,
      "queryParams": [],
      "body": false
    },
    "payloadGuide": null
  },
  {
    "name": "delete_api_v1_cart__id",
    "description": "Deletes $id from the target API via DELETE /api/v1/cart/${id}.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "request": {
      "method": "DELETE",
      "path": "/api/v1/cart/${id}",
      "pathParams": null,
      "queryParams": [],
      "body": false
    },
    "payloadGuide": null
  },
  {
    "name": "delete_api_v1_cart__userId",
    "description": "Deletes $userId from the target API via DELETE /api/v1/cart/${userId}.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "request": {
      "method": "DELETE",
      "path": "/api/v1/cart/${userId}",
      "pathParams": null,
      "queryParams": [],
      "body": false
    },
    "payloadGuide": null
  },
  {
    "name": "update_api_v1_cart__id",
    "description": "Updates a $id from the target API via PUT /api/v1/cart/${id}. Payload format: { product: string, user: string, quantity: number }.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "body": {
          "type": "object",
          "description": "Request body for PUT /api/v1/cart/${id}",
          "properties": {
            "product": {
              "type": "string"
            },
            "user": {
              "type": "string"
            },
            "quantity": {
              "type": "number"
            }
          },
          "required": []
        }
      },
      "required": [
        "body"
      ]
    },
    "request": {
      "method": "PUT",
      "path": "/api/v1/cart/${id}",
      "pathParams": null,
      "queryParams": [],
      "body": true
    },
    "payloadGuide": "{ product: string, user: string, quantity: number }"
  },
  {
    "name": "create_api_v1_order",
    "description": "Creates orders from the target API via POST /api/v1/orders. Payload format: {\"product\":[\"6689163bb32037101ed659ed\",\"66970a1708450baa9fb9c08d\"],\"user\":\"6a7d7e2939cf8829be3874ef\",\"quantity\":2,\"paymentInfo\":{\"id\":\"payment_id\",\"status\":\"payment_status\",\"paidAt\":\"2026-08-15T06:12:44.696Z\",\"itemsPrice\":\"1899.00\",\"taxPrice\":\"0\",\"shippingPrice\":\"50.00\",\"totalPrice\":\"1949.00\"}}.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "body": {
          "type": "object",
          "description": "Request body for POST /api/v1/orders",
          "properties": {
            "product": {
              "type": "array"
            },
            "user": {
              "type": "string"
            },
            "quantity": {
              "type": "number"
            },
            "paymentInfo": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string"
                },
                "status": {
                  "type": "string"
                },
                "paidAt": {
                  "type": "string"
                },
                "itemsPrice": {
                  "type": "string"
                },
                "taxPrice": {
                  "type": "string"
                },
                "shippingPrice": {
                  "type": "string"
                },
                "totalPrice": {
                  "type": "string"
                }
              },
              "required": []
            }
          },
          "required": []
        }
      },
      "required": [
        "body"
      ]
    },
    "request": {
      "method": "POST",
      "path": "/api/v1/orders",
      "pathParams": null,
      "queryParams": [],
      "body": true
    },
    "payloadGuide": "{\"product\":[\"6689163bb32037101ed659ed\",\"66970a1708450baa9fb9c08d\"],\"user\":\"6a7d7e2939cf8829be3874ef\",\"quantity\":2,\"paymentInfo\":{\"id\":\"payment_id\",\"status\":\"payment_status\",\"paidAt\":\"2026-08-15T06:12:44.696Z\",\"itemsPrice\":\"1899.00\",\"taxPrice\":\"0\",\"shippingPrice\":\"50.00\",\"totalPrice\":\"1949.00\"}}"
  },
  {
    "name": "get_api_v1_category",
    "description": "Retrieves category from the target API via GET /api/v1/category/.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "request": {
      "method": "GET",
      "path": "/api/v1/category/",
      "pathParams": null,
      "queryParams": [],
      "body": false
    },
    "payloadGuide": null
  },
  {
    "name": "get_api_v1_category__id",
    "description": "Retrieves $id from the target API via GET /api/v1/category/${id}.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "request": {
      "method": "GET",
      "path": "/api/v1/category/${id}",
      "pathParams": null,
      "queryParams": [],
      "body": false
    },
    "payloadGuide": null
  },
  {
    "name": "create_api_v1_inbox",
    "description": "Creates inbox from the target API via POST /api/v1/inbox. Payload format: { email: string, message: string, user: string }.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "body": {
          "type": "object",
          "description": "Request body for POST /api/v1/inbox",
          "properties": {
            "email": {
              "type": "string"
            },
            "message": {
              "type": "string"
            },
            "user": {
              "type": "string"
            }
          },
          "required": []
        }
      },
      "required": [
        "body"
      ]
    },
    "request": {
      "method": "POST",
      "path": "/api/v1/inbox",
      "pathParams": null,
      "queryParams": [],
      "body": true
    },
    "payloadGuide": "{ email: string, message: string, user: string }"
  },
  {
    "name": "get_api_v1_inbox",
    "description": "Retrieves inbox from the target API via GET /api/v1/inbox.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    },
    "request": {
      "method": "GET",
      "path": "/api/v1/inbox",
      "pathParams": null,
      "queryParams": [],
      "body": false
    },
    "payloadGuide": null
  }
];