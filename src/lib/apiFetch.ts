// Wraps fetch + res.json() for API routes protected by Clerk's middleware
// (src/proxy.ts). A request that doesn't pass the middleware's checks gets
// redirected instead of getting a JSON error back — fetch follows that
// transparently, so a plain `res.json()` on the resulting HTML page throws
// an opaque "JSON.parse: unexpected character..." error that gives the user
// no idea what actually happened. This inspects the redirect target so the
// message actually matches the cause instead of guessing "session expired"
// for every redirect (proxy.ts redirects to /sign-in when logged out, but
// also to /select-org when logged in with no active organization — those
// are different problems with different fixes).
export class ApiRedirectError extends Error {
  constructor(public readonly redirectUrl: string) {
    const path = (() => {
      try {
        return new URL(redirectUrl, window.location.origin).pathname;
      } catch {
        return redirectUrl;
      }
    })();
    const message = path.startsWith("/sign-in")
      ? "Tu sesión expiró. Recarga la página e inicia sesión de nuevo."
      : path.startsWith("/select-org")
        ? "No hay una organización activa. Selecciona una organización y vuelve a intentarlo."
        : `Respuesta inesperada del servidor (redirigido a ${path}). Recarga la página e intenta de nuevo.`;
    super(message);
    this.name = "ApiRedirectError";
    console.warn(`fetchJson: unexpected redirect to ${redirectUrl}`);
  }
}

export async function fetchJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (res.redirected) {
    throw new ApiRedirectError(res.url);
  }
  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Respuesta inesperada del servidor (${res.status}). Recarga la página e intenta de nuevo.`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Error (${res.status})`);
  return data as T;
}
