// Public-facing ids for /api/v1 reference-data resources (#56) — the
// internal db id stays a plain uuid (see schema.ts), but external callers
// see a `<prefix>_<uuid>` id, matching the `pdm_<mode>_<hex>` shape API keys
// already use (scripts/issue-api-key.ts). Prefixing is purely a
// presentation/parsing concern at the API boundary; nothing is stored this
// way.
export function toPublicId(prefix: string, id: string): string {
  return `${prefix}_${id}`;
}

// Returns null (not a throw) on a malformed/wrong-prefix id so callers can
// turn it into a standard 404/400 instead of a 500.
export function fromPublicId(prefix: string, publicId: string): string | null {
  const wantedPrefix = `${prefix}_`;
  if (!publicId.startsWith(wantedPrefix)) return null;
  const id = publicId.slice(wantedPrefix.length);
  return id.length > 0 ? id : null;
}
