# Shopify MCP Server (Multi-Store)

Fork of [amir-bengherbi/shopify-mcp-server](https://github.com/amir-bengherbi/shopify-mcp-server) with **multi-store support**.

Manage multiple Shopify stores from a single MCP server. Each tool accepts an optional `store` parameter to select which store to operate on. When only one store is configured, it's used automatically.

## What's Different from Upstream

- **Multi-store support**: Configure multiple stores via a JSON config file
- **`list-stores` tool**: See all connected stores
- **`store` parameter**: Added to all 15 existing tools (optional)
- **Backward compatible**: Single-store env var setup still works
- **API version**: Updated to `2025-01`

## Quick Start

### Option A: Multi-Store Config (Recommended)

Create a config file (e.g., `~/.config/shopify-stores.json`):

```json
[
  {"name": "waizy", "domain": "waizy-store.myshopify.com", "accessToken": "shpat_xxx"},
  {"name": "client-a", "domain": "client-a.myshopify.com", "accessToken": "shpat_yyy"}
]
```

Then configure your MCP client:

```json
{
  "mcpServers": {
    "shopify": {
      "command": "node",
      "args": ["/path/to/shopify-mcp/build/index.js"],
      "env": {
        "SHOPIFY_STORES_CONFIG": "~/.config/shopify-stores.json"
      }
    }
  }
}
```

### Option B: Single Store (Backward Compatible)

```json
{
  "mcpServers": {
    "shopify": {
      "command": "node",
      "args": ["/path/to/shopify-mcp/build/index.js"],
      "env": {
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxx",
        "MYSHOPIFY_DOMAIN": "your-store.myshopify.com"
      }
    }
  }
}
```

## Creating a Shopify Access Token

For each store you want to connect:

1. From Shopify admin, go to **Settings** > **Apps and sales channels**
2. Click **Develop apps** (enable developer preview if needed)
3. Click **Create an app** (e.g., "MCP Server")
4. Click **Configure Admin API scopes** and select:
   - `read_products`, `write_products`
   - `read_customers`, `write_customers`
   - `read_orders`, `write_orders`
   - `read_inventory` (optional, for inventory data)
5. Click **Save**, then **Install app**
6. Copy the **Admin API access token**

More details: [Shopify Custom Apps](https://help.shopify.com/en/manual/apps/app-types/custom-apps)

## Tools

All tools accept an optional `store` parameter. When omitted with a single configured store, that store is used. When multiple stores exist, `store` is required.

### Store Management
- **`list-stores`** - List all configured stores (name + domain)

### Products
- **`get-products`** - Search products by title or list all
- **`get-products-by-collection`** - Get products from a collection
- **`get-products-by-ids`** - Get specific products by ID
- **`get-variants-by-ids`** - Get product variants by ID

### Customers
- **`get-customers`** - List customers (paginated)
- **`tag-customer`** - Add tags to a customer

### Orders
- **`get-orders`** - Query orders with filters and sorting
- **`get-order`** - Get a single order by ID

### Discounts
- **`create-discount`** - Create a basic discount code

### Draft Orders
- **`create-draft-order`** - Create a draft order
- **`complete-draft-order`** - Complete a draft order

### Collections
- **`get-collections`** - List collections

### Shop
- **`get-shop`** - Get basic shop details
- **`get-shop-details`** - Get extended shop details (shipping countries)

### Webhooks
- **`manage-webhook`** - Subscribe, find, or unsubscribe webhooks

## Development

```bash
npm install
npm run build
```

Tests require a `.env` with real credentials:
```
SHOPIFY_ACCESS_TOKEN=shpat_xxx
MYSHOPIFY_DOMAIN=your-store.myshopify.com
```

```bash
npm test
```

## License

MIT (same as upstream)
