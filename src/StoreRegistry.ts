import { readFileSync } from "fs";
import { resolve } from "path";

export interface StoreConfig {
  name: string;
  domain: string;
  accessToken: string;
}

export class StoreRegistry {
  private stores: Map<string, StoreConfig> = new Map();

  constructor() {
    this.load();
  }

  private load(): void {
    const configPath = process.env.SHOPIFY_STORES_CONFIG;

    if (configPath) {
      this.loadFromFile(configPath);
    } else {
      this.loadFromEnv();
    }

    if (this.stores.size === 0) {
      console.error(
        "Error: No Shopify stores configured. Set SHOPIFY_STORES_CONFIG or MYSHOPIFY_DOMAIN + SHOPIFY_ACCESS_TOKEN"
      );
      process.exit(1);
    }
  }

  private loadFromFile(configPath: string): void {
    const resolvedPath = configPath.startsWith("~")
      ? configPath.replace("~", process.env.HOME || "")
      : resolve(configPath);

    let raw: string;
    try {
      raw = readFileSync(resolvedPath, "utf-8");
    } catch (err: any) {
      console.error(`Error reading stores config at ${resolvedPath}: ${err.message}`);
      process.exit(1);
    }

    let entries: unknown;
    try {
      entries = JSON.parse(raw);
    } catch {
      console.error(`Error: Invalid JSON in stores config at ${resolvedPath}`);
      process.exit(1);
    }

    if (!Array.isArray(entries)) {
      console.error("Error: Stores config must be a JSON array");
      process.exit(1);
    }

    for (const entry of entries) {
      if (!entry.name || !entry.domain || !entry.accessToken) {
        console.error(
          `Error: Each store entry must have name, domain, and accessToken. Got: ${JSON.stringify(entry)}`
        );
        process.exit(1);
      }
      this.stores.set(entry.name, {
        name: entry.name,
        domain: entry.domain,
        accessToken: entry.accessToken,
      });
    }
  }

  private loadFromEnv(): void {
    const domain = process.env.MYSHOPIFY_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (domain && accessToken) {
      const name = domain.replace(".myshopify.com", "");
      this.stores.set(name, { name, domain, accessToken });
    }
  }

  resolve(storeName?: string): StoreConfig {
    if (!storeName) {
      if (this.stores.size === 1) {
        return this.stores.values().next().value!;
      }
      throw new Error(
        `Multiple stores configured. Specify a store name. Available: ${this.listNames().join(", ")}`
      );
    }

    const store = this.stores.get(storeName);
    if (!store) {
      throw new Error(
        `Store "${storeName}" not found. Available: ${this.listNames().join(", ")}`
      );
    }
    return store;
  }

  listNames(): string[] {
    return Array.from(this.stores.keys());
  }

  listStores(): Array<{ name: string; domain: string }> {
    return Array.from(this.stores.values()).map((s) => ({
      name: s.name,
      domain: s.domain,
    }));
  }
}
