import { KLAVIYO_API_BASE, KLAVIYO_API_VERSION } from "../constants.js";
import type { KlaviyoErrorResponse } from "../types.js";

export class KlaviyoApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errors?: KlaviyoErrorResponse["errors"]
  ) {
    super(message);
    this.name = "KlaviyoApiError";
  }
}

export function clientFromEnv(): KlaviyoClient {
  const apiKey = process.env.KLAVIYO_API_KEY;
  if (!apiKey) {
    throw new KlaviyoApiError(
      "KLAVIYO_API_KEY environment variable is required. " +
      "Get your private API key from Klaviyo → Settings → API Keys.",
      401
    );
  }
  return new KlaviyoClient(apiKey);
}

export class KlaviyoClient {
  private readonly headers: Record<string, string>;

  constructor(apiKey: string) {
    this.headers = {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "Content-Type": "application/json",
      "revision": KLAVIYO_API_VERSION,
      "Accept": "application/json",
    };
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = this.buildUrl(path, params);
    const res = await fetch(url, { method: "GET", headers: this.headers });
    return this.handleResponse<T>(res);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${KLAVIYO_API_BASE}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(res);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = `${KLAVIYO_API_BASE}${path}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(res);
  }

  async delete(path: string): Promise<void> {
    const url = `${KLAVIYO_API_BASE}${path}`;
    const res = await fetch(url, { method: "DELETE", headers: this.headers });
    if (!res.ok && res.status !== 204) {
      await this.handleResponse(res);
    }
  }

  /** Follow a full cursor URL returned in links.next */
  async getByUrl<T>(fullUrl: string): Promise<T> {
    const res = await fetch(fullUrl, { method: "GET", headers: this.headers });
    return this.handleResponse<T>(res);
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(`${KLAVIYO_API_BASE}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (res.status === 204) {
      return undefined as unknown as T;
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new KlaviyoApiError(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`, res.status);
    }
    if (!res.ok) {
      const errBody = json as KlaviyoErrorResponse;
      const detail = errBody?.errors?.[0]?.detail ?? errBody?.errors?.[0]?.title ?? "Unknown error";
      throw new KlaviyoApiError(
        `Klaviyo API error ${res.status}: ${detail}`,
        res.status,
        errBody?.errors
      );
    }
    return json as T;
  }
}
