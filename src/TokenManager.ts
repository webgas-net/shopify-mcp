interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export class TokenManager {
  private cache: Map<string, CachedToken> = new Map();
  private static REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

  async getToken(
    domain: string,
    clientId: string,
    clientSecret: string
  ): Promise<string> {
    const cached = this.cache.get(domain);
    if (
      cached &&
      Date.now() < cached.expiresAt - TokenManager.REFRESH_BUFFER_MS
    ) {
      return cached.accessToken;
    }

    const token = await this.fetchToken(domain, clientId, clientSecret);
    this.cache.set(domain, token);
    console.error(
      `[TokenManager] Fetched new access token for ${domain} (expires in ${Math.round((token.expiresAt - Date.now()) / 1000 / 60)} min)`
    );
    return token.accessToken;
  }

  private async fetchToken(
    domain: string,
    clientId: string,
    clientSecret: string
  ): Promise<CachedToken> {
    const response = await fetch(
      `https://${domain}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to fetch access token for ${domain}: ${response.status} ${error}`
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      scope: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }
}
