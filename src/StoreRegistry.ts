import { readFileSync } from "fs";
import { resolve } from "path";
import { TokenManager } from "./TokenManager.js";

export interface StoreConfig {
  name: string;
  domain: string;
  accessToken: string;
}

interface StoreEntry {
  name: string;
  domain: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class StoreRegistry {
  private stores: Map<string, StoreEntry> = new Map();
  private tokenManager = new TokenManager();

  constructor() {
    this.load();
  }

  private load(): void {
    const configJson = process.env.SHOPIFY_STORES_CONFIG_JSON;
    const configPath = process.env.SHOPIFY_STORES_CONFIG;

    if (configJson) {
      this.loadFromJson(configJson);
    } else if (configPath) {
      this.loadFromFile(configPath);
    } else {
      this.loadFromEnv();
    }

    if (this.stores.size === 0) {
      console.error(
        "Error: No Shopify stores configured. Set SHOPIFY_STORES_CONFIG_JSON, SHOPIFY_STORES_CONFIG, or MYSHOPIFY_DOMAIN + (SHOPIFY_ACCESS_TOKEN | SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET)"
      );
      process.exit(1);
    }
  }

  private loadFromJson(json: string): void {
    let entries: unknown;
    try {
      entries = JSON.parse(json);
    } catch {
      console.error("Error: Invalid JSON in SHOPIFY_STORES_CONFIG_JSON env var");
      process.exit(1);
    }
    this.loadEntries(entries);
  }

  private loadFromFile(configPath: string): void {
    const resolvedPath = configPath.startsWith("~")
      ? configPath.replace("~", process.env.HOME || "")
      : resolve(configPath);

    let raw: string;
    try {
      raw = readFileSync(resolvedPath, "utf-8");
    } catch (err: any) {
      console.error(
        `Error reading stores config at ${resolvedPath}: ${err.message}`
      );
      process.exit(1);
    }

    let entries: unknown;
    try {
      entries = JSON.parse(raw);
    } catch {
      console.error(`Error: Invalid JSON in stores config at ${resolvedPath}`);
      process.exit(1);
    }

    this.loadEntries(entries);
  }

  private loadEntries(entries: unknown): void {
    if (!Array.isArray(entries)) {
      console.error("Error: Stores config must be a JSON array");
      process.exit(1);
    }

    for (const entry of entries) {
      if (!entry.name || !entry.domain) {
        console.error(
          `Error: Each store entry must have name and domain. Got: ${JSON.stringify(entry)}`
        );
        process.exit(1);
      }

      const hasStaticToken = !!entry.accessToken;
      const hasClientCreds = !!entry.clientId && !!entry.clientSecret;

      if (!hasStaticToken && !hasClientCreds) {
        console.error(
          `Error: Store "${entry.name}" must have either accessToken or (clientId + clientSecret). Got: ${JSON.stringify(entry)}`
        );
        process.exit(1);
      }

      this.stores.set(entry.name, {
        name: entry.name,
        domain: entry.domain,
        accessToken: entry.accessToken,
        clientId: entry.clientId,
        clientSecret: entry.clientSecret,
      });
    }
  }

  private loadFromEnv(): void {
    const domain = process.env.MYSHOPIFY_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (domain && (accessToken || (clientId && clientSecret))) {
      const name = domain.replace(".myshopify.com", "");
      this.stores.set(name, {
        name,
        domain,
        accessToken,
        clientId,
        clientSecret,
      });
    }
  }

  async resolve(storeName?: string): Promise<StoreConfig> {
    let entry: StoreEntry;

    if (!storeName) {
      if (this.stores.size === 1) {
        entry = this.stores.values().next().value!;
      } else {
        throw new Error(
          `Multiple stores configured. Specify a store name. Available: ${this.listNames().join(", ")}`
        );
      }
    } else {
      const found = this.stores.get(storeName);
      if (!found) {
        throw new Error(
          `Store "${storeName}" not found. Available: ${this.listNames().join(", ")}`
        );
      }
      entry = found;
    }

    // Static token: return directly
    if (entry.accessToken) {
      return {
        name: entry.name,
        domain: entry.domain,
        accessToken: entry.accessToken,
      };
    }

    // Client credentials: fetch/refresh token via TokenManager
    if (entry.clientId && entry.clientSecret) {
      const accessToken = await this.tokenManager.getToken(
        entry.domain,
        entry.clientId,
        entry.clientSecret
      );
      return {
        name: entry.name,
        domain: entry.domain,
        accessToken,
      };
    }

    throw new Error(`Store "${entry.name}" has no valid authentication config`);
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
