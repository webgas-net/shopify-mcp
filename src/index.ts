#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ShopifyClient } from "./ShopifyClient/ShopifyClient.js";
import {
  CustomError,
  ProductNode,
  ShopifyOrderGraphql,
  CreateBasicDiscountCodeInput,
  CreateDraftOrderPayload,
  ShopifyWebhookTopic,
} from "./ShopifyClient/ShopifyClientPort.js";
import { StoreRegistry } from "./StoreRegistry.js";

const server = new McpServer({
  name: "shopify-tools",
  version: "2.0.0",
});

const registry = new StoreRegistry();

const storeParam = z
  .string()
  .optional()
  .describe(
    "Store name (from config). Omit if only one store is configured. Use list-stores to see available stores."
  );

function formatProduct(product: ProductNode): string {
  return `
  Product: ${product.title}
  description: ${product.description}
  handle: ${product.handle}
  variants: ${product.variants.edges
    .map(
      (variant) => `variant.title: ${variant.node.title}
    variant.id: ${variant.node.id}
    variant.price: ${variant.node.price}
    variant.sku: ${variant.node.sku}
    variant.inventoryPolicy: ${variant.node.inventoryPolicy}
    `
    )
    .join(", ")}
  `;
}

function formatOrder(order: ShopifyOrderGraphql): string {
  return `
  Order: ${order.name} (${order.id})
  Created At: ${order.createdAt}
  Status: ${order.displayFinancialStatus || "N/A"}
  Email: ${order.email || "N/A"}
  Phone: ${order.phone || "N/A"}

  Total Price: ${order.totalPriceSet.shopMoney.amount} ${
    order.totalPriceSet.shopMoney.currencyCode
  }

  Customer: ${
    order.customer
      ? `
    ID: ${order.customer.id}
    Email: ${order.customer.email}`
      : "No customer information"
  }

  Shipping Address: ${
    order.shippingAddress
      ? `
    Province: ${order.shippingAddress.provinceCode || "N/A"}
    Country: ${order.shippingAddress.countryCode}`
      : "No shipping address"
  }

  Line Items: ${
    order.lineItems.nodes.length > 0
      ? order.lineItems.nodes
          .map(
            (item) => `
    Title: ${item.title}
    Quantity: ${item.quantity}
    Price: ${item.originalTotalSet.shopMoney.amount} ${
              item.originalTotalSet.shopMoney.currencyCode
            }
    Variant: ${
      item.variant
        ? `
      Title: ${item.variant.title}
      SKU: ${item.variant.sku || "N/A"}
      Price: ${item.variant.price}`
        : "No variant information"
    }`
          )
          .join("\n")
      : "No items"
  }
  `;
}

// === Store Management ===

server.tool(
  "list-stores",
  "List all configured Shopify stores",
  {},
  async () => {
    const stores = registry.listStores();
    return {
      content: [
        {
          type: "text",
          text: stores.length > 0
            ? stores
                .map((s) => `${s.name}: ${s.domain}`)
                .join("\n")
            : "No stores configured",
        },
      ],
    };
  }
);

// === Products Tools ===

server.tool(
  "get-products",
  "Get all products or search by title",
  {
    store: storeParam,
    searchTitle: z
      .string()
      .optional()
      .describe("Search title, if missing, will return all products"),
    limit: z.number().describe("Maximum number of products to return"),
  },
  async ({ store, searchTitle, limit }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const products = await client.loadProducts(
        s.accessToken,
        s.domain,
        searchTitle ?? null,
        limit
      );
      const formattedProducts = products.products.map(formatProduct);
      return {
        content: [{ type: "text", text: formattedProducts.join("\n") }],
      };
    } catch (error) {
      return handleError("Failed to retrieve products data", error);
    }
  }
);

server.tool(
  "get-products-by-collection",
  "Get products from a specific collection",
  {
    store: storeParam,
    collectionId: z
      .string()
      .describe("ID of the collection to get products from"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of products to return"),
  },
  async ({ store, collectionId, limit }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const products = await client.loadProductsByCollectionId(
        s.accessToken,
        s.domain,
        collectionId,
        limit
      );
      const formattedProducts = products.products.map(formatProduct);
      return {
        content: [{ type: "text", text: formattedProducts.join("\n") }],
      };
    } catch (error) {
      return handleError("Failed to retrieve products from collection", error);
    }
  }
);

server.tool(
  "get-products-by-ids",
  "Get products by their IDs",
  {
    store: storeParam,
    productIds: z
      .array(z.string())
      .describe("Array of product IDs to retrieve"),
  },
  async ({ store, productIds }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const products = await client.loadProductsByIds(
        s.accessToken,
        s.domain,
        productIds
      );
      const formattedProducts = products.products.map(formatProduct);
      return {
        content: [{ type: "text", text: formattedProducts.join("\n") }],
      };
    } catch (error) {
      return handleError("Failed to retrieve products by IDs", error);
    }
  }
);

server.tool(
  "get-variants-by-ids",
  "Get product variants by their IDs",
  {
    store: storeParam,
    variantIds: z
      .array(z.string())
      .describe("Array of variant IDs to retrieve"),
  },
  async ({ store, variantIds }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const variants = await client.loadVariantsByIds(
        s.accessToken,
        s.domain,
        variantIds
      );
      return {
        content: [{ type: "text", text: JSON.stringify(variants, null, 2) }],
      };
    } catch (error) {
      return handleError("Failed to retrieve variants", error);
    }
  }
);

// === Customer Tools ===

server.tool(
  "get-customers",
  "Get shopify customers with pagination support",
  {
    store: storeParam,
    limit: z.number().optional().describe("Limit of customers to return"),
    next: z.string().optional().describe("Next page cursor"),
  },
  async ({ store, limit, next }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const response = await client.loadCustomers(
        s.accessToken,
        s.domain,
        limit,
        next
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return handleError("Failed to retrieve customers data", error);
    }
  }
);

server.tool(
  "tag-customer",
  "Add tags to a customer",
  {
    store: storeParam,
    customerId: z.string().describe("Customer ID to tag"),
    tags: z.array(z.string()).describe("Tags to add to the customer"),
  },
  async ({ store, customerId, tags }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const success = await client.tagCustomer(
        s.accessToken,
        s.domain,
        tags,
        customerId
      );
      return {
        content: [
          {
            type: "text",
            text: success
              ? "Successfully tagged customer"
              : "Failed to tag customer",
          },
        ],
      };
    } catch (error) {
      return handleError("Failed to tag customer", error);
    }
  }
);

// === Order Tools ===

server.tool(
  "get-orders",
  "Get shopify orders with advanced filtering and sorting",
  {
    store: storeParam,
    first: z.number().optional().describe("Limit of orders to return"),
    after: z.string().optional().describe("Next page cursor"),
    query: z.string().optional().describe("Filter orders using query syntax"),
    sortKey: z
      .enum([
        "PROCESSED_AT",
        "TOTAL_PRICE",
        "ID",
        "CREATED_AT",
        "UPDATED_AT",
        "ORDER_NUMBER",
      ])
      .optional()
      .describe("Field to sort by"),
    reverse: z.boolean().optional().describe("Reverse sort order"),
  },
  async ({ store, first, after, query, sortKey, reverse }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const response = await client.loadOrders(s.accessToken, s.domain, {
        first,
        after,
        query,
        sortKey,
        reverse,
      });
      const formattedOrders = response.orders.map(formatOrder);
      return {
        content: [{ type: "text", text: formattedOrders.join("\n---\n") }],
      };
    } catch (error) {
      return handleError("Failed to retrieve orders data", error);
    }
  }
);

server.tool(
  "get-order",
  "Get a single order by ID",
  {
    store: storeParam,
    orderId: z.string().describe("ID of the order to retrieve"),
  },
  async ({ store, orderId }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const order = await client.loadOrder(s.accessToken, s.domain, {
        orderId,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(order, null, 2) }],
      };
    } catch (error) {
      return handleError("Failed to retrieve order", error);
    }
  }
);

// === Discount Tools ===

server.tool(
  "create-discount",
  "Create a basic discount code",
  {
    store: storeParam,
    title: z.string().describe("Title of the discount"),
    code: z.string().describe("Discount code that customers will enter"),
    valueType: z
      .enum(["percentage", "fixed_amount"])
      .describe("Type of discount"),
    value: z
      .number()
      .describe("Discount value (percentage as decimal or fixed amount)"),
    startsAt: z.string().describe("Start date in ISO format"),
    endsAt: z.string().optional().describe("Optional end date in ISO format"),
    appliesOncePerCustomer: z
      .boolean()
      .describe("Whether discount can be used only once per customer"),
  },
  async ({
    store,
    title,
    code,
    valueType,
    value,
    startsAt,
    endsAt,
    appliesOncePerCustomer,
  }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const discountInput: CreateBasicDiscountCodeInput = {
        title,
        code,
        valueType,
        value,
        startsAt,
        endsAt,
        includeCollectionIds: [],
        excludeCollectionIds: [],
        appliesOncePerCustomer,
        combinesWith: {
          productDiscounts: true,
          orderDiscounts: true,
          shippingDiscounts: true,
        },
      };
      const discount = await client.createBasicDiscountCode(
        s.accessToken,
        s.domain,
        discountInput
      );
      return {
        content: [{ type: "text", text: JSON.stringify(discount, null, 2) }],
      };
    } catch (error) {
      return handleError("Failed to create discount", error);
    }
  }
);

// === Draft Order Tools ===

server.tool(
  "create-draft-order",
  "Create a draft order",
  {
    store: storeParam,
    lineItems: z
      .array(
        z.object({
          variantId: z.string(),
          quantity: z.number(),
        })
      )
      .describe("Line items to add to the order"),
    email: z.string().email().describe("Customer email"),
    shippingAddress: z
      .object({
        address1: z.string(),
        city: z.string(),
        province: z.string(),
        country: z.string(),
        zip: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        countryCode: z.string(),
      })
      .describe("Shipping address details"),
    note: z.string().optional().describe("Optional note for the order"),
  },
  async ({ store, lineItems, email, shippingAddress, note }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const draftOrderData: CreateDraftOrderPayload = {
        lineItems,
        email,
        shippingAddress,
        billingAddress: shippingAddress,
        tags: "draft",
        note: note || "",
      };
      const draftOrder = await client.createDraftOrder(
        s.accessToken,
        s.domain,
        draftOrderData
      );
      return {
        content: [{ type: "text", text: JSON.stringify(draftOrder, null, 2) }],
      };
    } catch (error) {
      return handleError("Failed to create draft order", error);
    }
  }
);

server.tool(
  "complete-draft-order",
  "Complete a draft order",
  {
    store: storeParam,
    draftOrderId: z.string().describe("ID of the draft order to complete"),
    variantId: z.string().describe("ID of the variant in the draft order"),
  },
  async ({ store, draftOrderId, variantId }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const completedOrder = await client.completeDraftOrder(
        s.accessToken,
        s.domain,
        draftOrderId,
        variantId
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(completedOrder, null, 2) },
        ],
      };
    } catch (error) {
      return handleError("Failed to complete draft order", error);
    }
  }
);

// === Collection Tools ===

server.tool(
  "get-collections",
  "Get all collections",
  {
    store: storeParam,
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of collections to return"),
    name: z.string().optional().describe("Filter collections by name"),
  },
  async ({ store, limit, name }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const collections = await client.loadCollections(
        s.accessToken,
        s.domain,
        { limit, name }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(collections, null, 2) }],
      };
    } catch (error) {
      return handleError("Failed to retrieve collections", error);
    }
  }
);

// === Shop Tools ===

server.tool(
  "get-shop",
  "Get shop details",
  { store: storeParam },
  async ({ store }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const shop = await client.loadShop(s.accessToken, s.domain);
      return {
        content: [{ type: "text", text: JSON.stringify(shop, null, 2) }],
      };
    } catch (error) {
      return handleError("Failed to retrieve shop details", error);
    }
  }
);

server.tool(
  "get-shop-details",
  "Get extended shop details including shipping countries",
  { store: storeParam },
  async ({ store }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      const shopDetails = await client.loadShopDetail(
        s.accessToken,
        s.domain
      );
      return {
        content: [{ type: "text", text: JSON.stringify(shopDetails, null, 2) }],
      };
    } catch (error) {
      return handleError("Failed to retrieve extended shop details", error);
    }
  }
);

// === Webhook Tools ===

server.tool(
  "manage-webhook",
  "Subscribe, find, or unsubscribe webhooks",
  {
    store: storeParam,
    action: z
      .enum(["subscribe", "find", "unsubscribe"])
      .describe("Action to perform with webhook"),
    callbackUrl: z.string().url().describe("Webhook callback URL"),
    topic: z
      .nativeEnum(ShopifyWebhookTopic)
      .describe("Webhook topic to subscribe to"),
    webhookId: z
      .string()
      .optional()
      .describe("Webhook ID (required for unsubscribe)"),
  },
  async ({ store, action, callbackUrl, topic, webhookId }) => {
    const client = new ShopifyClient();
    try {
      const s = await registry.resolve(store);
      switch (action) {
        case "subscribe": {
          const webhook = await client.subscribeWebhook(
            s.accessToken,
            s.domain,
            callbackUrl,
            topic
          );
          return {
            content: [{ type: "text", text: JSON.stringify(webhook, null, 2) }],
          };
        }
        case "find": {
          const webhook = await client.findWebhookByTopicAndCallbackUrl(
            s.accessToken,
            s.domain,
            callbackUrl,
            topic
          );
          return {
            content: [{ type: "text", text: JSON.stringify(webhook, null, 2) }],
          };
        }
        case "unsubscribe": {
          if (!webhookId) {
            throw new Error("webhookId is required for unsubscribe action");
          }
          await client.unsubscribeWebhook(
            s.accessToken,
            s.domain,
            webhookId
          );
          return {
            content: [
              { type: "text", text: "Webhook unsubscribed successfully" },
            ],
          };
        }
      }
    } catch (error) {
      return handleError("Failed to manage webhook", error);
    }
  }
);

// Utility function to handle errors
function handleError(
  defaultMessage: string,
  error: unknown
): {
  content: { type: "text"; text: string }[];
  isError: boolean;
} {
  let errorMessage = defaultMessage;
  if (error instanceof CustomError) {
    errorMessage = `${defaultMessage}: ${error.message}`;
  } else if (error instanceof Error) {
    errorMessage = `${defaultMessage}: ${error.message}`;
  }
  return {
    content: [{ type: "text", text: errorMessage }],
    isError: true,
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Shopify MCP Server running on stdio (${registry.listNames().length} store(s): ${registry.listNames().join(", ")})`
  );
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
