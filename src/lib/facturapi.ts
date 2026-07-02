const BASE = "https://www.facturapi.io/v2/";

export class FacturapiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.message ?? JSON.stringify(body);
  } catch {
    return res.statusText;
  }
}

export function createFacturapiClient(apiKey: string) {
  async function request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts: { json?: unknown; params?: Record<string, string | number | undefined>; raw?: boolean } = {}
  ): Promise<T> {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(opts.params ?? {})) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    });
    if (!res.ok) {
      throw new FacturapiError(res.status, await parseErrorMessage(res));
    }
    if (opts.raw) return res as unknown as T;
    return res.json() as Promise<T>;
  }

  return {
    get: <T>(path: string, params?: Record<string, string | number | undefined>) =>
      request<T>("GET", path, { params }),
    post: <T>(path: string, json?: unknown) => request<T>("POST", path, { json }),
    put: <T>(path: string, json?: unknown) => request<T>("PUT", path, { json }),
    delete: <T>(path: string, params?: Record<string, string | number | undefined>) =>
      request<T>("DELETE", path, { params }),
    raw: (method: "GET" | "POST", path: string, opts: { json?: unknown } = {}) =>
      request<Response>(method, path, { ...opts, raw: true }),
  };
}

export type FacturapiClient = ReturnType<typeof createFacturapiClient>;
