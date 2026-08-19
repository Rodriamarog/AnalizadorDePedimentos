// Wraps fetch + res.json() for API routes protected by Clerk's middleware.
// If the session expired mid-use, the middleware 307-redirects to
// /sign-in?redirect_url=... instead of returning JSON; fetch follows that
// redirect transparently, so a plain `res.json()` on the resulting sign-in
// HTML throws an opaque "JSON.parse: unexpected character..." error that
// gives the user no idea what actually happened. Detecting the redirect (or
// a non-JSON content-type, same underlying cause) lets callers show a clear
// "session expired" message instead.
export class SessionExpiredError extends Error {
  constructor() {
    super("Tu sesión expiró. Recarga la página e inicia sesión de nuevo.");
    this.name = "SessionExpiredError";
  }
}

export async function fetchJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (res.redirected || !res.headers.get("content-type")?.includes("application/json")) {
    throw new SessionExpiredError();
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Error (${res.status})`);
  return data as T;
}
