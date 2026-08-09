const BASE = "https://www.facturapi.io/v2/";
const TIMEOUT_MS = 15_000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFacturapiClient(apiKey: string) {
  async function request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts: {
      json?: unknown;
      form?: FormData;
      params?: Record<string, string | number | undefined>;
      raw?: boolean;
    } = {}
  ): Promise<T> {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(opts.params ?? {})) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }

    // FacturAPI calls can hang/time out at the network level (ETIMEDOUT), or
    // get rejected with 429 when a report fires many requests in parallel —
    // confirmed against the live API: even 8 concurrent requests can draw a
    // 429. Retry both cases with backoff (honoring Retry-After on 429)
    // before giving up.
    const MAX_ATTEMPTS = 4;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            // No Content-Type for FormData — fetch sets the multipart
            // boundary itself.
            ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
          signal: controller.signal,
        });
        if (!res.ok) {
          if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS - 1) {
            const retryAfterHeader = Number(res.headers.get("retry-after"));
            const delay = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
              ? retryAfterHeader * 1000
              : 500 * 2 ** attempt;
            await sleep(delay);
            continue;
          }
          throw new FacturapiError(res.status, await parseErrorMessage(res));
        }
        if (opts.raw) return res as unknown as T;
        return (await res.json()) as T;
      } catch (e) {
        if (e instanceof FacturapiError) throw e;
        lastError = e;
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new FacturapiError(
      502,
      `No se pudo conectar con FacturAPI (${method} ${path}): ${reason}`
    );
  }

  return {
    get: <T>(path: string, params?: Record<string, string | number | undefined>) =>
      request<T>("GET", path, { params }),
    post: <T>(path: string, json?: unknown) => request<T>("POST", path, { json }),
    put: <T>(path: string, json?: unknown) => request<T>("PUT", path, { json }),
    putForm: <T>(path: string, form: FormData) => request<T>("PUT", path, { form }),
    delete: <T>(path: string, params?: Record<string, string | number | undefined>) =>
      request<T>("DELETE", path, { params }),
    raw: (method: "GET" | "POST", path: string, opts: { json?: unknown } = {}) =>
      request<Response>(method, path, { ...opts, raw: true }),
  };
}

export type FacturapiClient = ReturnType<typeof createFacturapiClient>;
