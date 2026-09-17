export type TranslationDictionary = Record<string, string>;

// Deep-walks a generated OpenAPI document and replaces every `summary`/
// `description` string value via `dict`. The English document from
// generateOpenApiDocument() stays the canonical source; this produces a
// translated copy without touching the ~15 route files that build it.
//
// A string with no entry in `dict` is left untranslated (English) and
// reported: thrown in dev so a new endpoint's untranslated strings are
// caught immediately, logged in production so a missed translation
// degrades to English instead of breaking the docs endpoint.
export function translateDocument<T>(doc: T, dict: TranslationDictionary): T {
  const missing = new Set<string>();

  function translate(value: string): string {
    if (Object.prototype.hasOwnProperty.call(dict, value)) return dict[value];
    missing.add(value);
    return value;
  }

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        out[key] =
          (key === "summary" || key === "description") && typeof value === "string"
            ? translate(value)
            : walk(value);
      }
      return out;
    }
    return node;
  }

  const translated = walk(doc) as T;

  if (missing.size > 0) {
    const message = `openapi Spanish translation is missing ${missing.size} string(s):\n${[...missing]
      .map((s) => `  - ${JSON.stringify(s)}`)
      .join("\n")}`;
    if (process.env.NODE_ENV !== "production") {
      throw new Error(message);
    }
    console.error(message);
  }

  return translated;
}
