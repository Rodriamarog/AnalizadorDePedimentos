interface CatalogItem {
  key: string;
  description: string;
}

// Batches description lookups for a set of already-known catalog keys,
// deduplicated, one fetch per *unique* key rather than one per row — same
// strategy as the old app's unitDescMap (frontend/index.html:1696-1707).
// Used to pre-populate <SatComboBox description=...> so it doesn't have to
// self-resolve on mount, which would fire one fetch per rendered instance.
export async function fetchCatalogDescriptions(
  endpoint: "/api/catalogs/products" | "/api/catalogs/units",
  keys: (string | null | undefined)[]
): Promise<Record<string, string>> {
  const unique = [...new Set(keys.filter((k): k is string => !!k))];
  if (unique.length === 0) return {};

  const entries = await Promise.all(
    unique.map(async (key): Promise<[string, string] | null> => {
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(key)}`);
        if (!res.ok) return null;
        const { data } = await res.json();
        const match = (data as CatalogItem[]).find((d) => d.key === key);
        return match ? [key, match.description] : null;
      } catch {
        return null;
      }
    })
  );

  return Object.fromEntries(entries.filter((e): e is [string, string] => e !== null));
}
