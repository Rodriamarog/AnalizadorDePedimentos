import { sql } from "drizzle-orm";
import { db } from "./db/client";

export interface SatCatalogResult extends Record<string, unknown> {
  key: string;
  description: string;
}

// Strip accents so "camión" and "camion" match the same way the old
// SQLite-backed search did (Python's unicodedata NFD strip, ported 1:1).
const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(COMBINING_DIACRITICS, "");
}

function extractWords(q: string): string[] {
  return normalize(q).match(/[a-z]{2,}/g) ?? [];
}

// Builds a tsquery string like `word1:* & word2:*` (AND) or `word1:* | word2:*`
// (OR), each word matched as a prefix — the tsquery equivalent of the old
// FTS5 `"word"*` syntax. Words are already restricted to [a-z]{2,} by
// extractWords, so no further escaping is needed before embedding in the
// query string.
function buildTsQuery(words: string[], mode: "AND" | "OR"): string {
  const op = mode === "OR" ? " | " : " & ";
  return words.map((w) => `${w}:*`).join(op);
}

async function ftsSearch(
  table: "sat_claves" | "sat_unidades",
  words: string[],
  limit: number,
  preferOr: boolean
): Promise<SatCatalogResult[]> {
  async function run(mode: "AND" | "OR") {
    const tsq = buildTsQuery(words, mode);
    const result = await db.execute<SatCatalogResult>(sql`
      SELECT key, description
      FROM ${sql.raw(table)}
      WHERE search @@ to_tsquery('spanish', ${tsq})
      ORDER BY ts_rank(search, to_tsquery('spanish', ${tsq})) DESC
      LIMIT ${limit}
    `);
    return result.rows;
  }

  try {
    if (preferOr) {
      return await run("OR");
    }
    const andRows = await run("AND");
    if (andRows.length === 0 && words.length > 1) {
      return await run("OR");
    }
    return andRows;
  } catch {
    const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
    const result = await db.execute<SatCatalogResult>(sql`
      SELECT key, description
      FROM ${sql.raw(table)}
      WHERE description ILIKE ${`%${longest}%`}
      LIMIT ${limit}
    `);
    return result.rows;
  }
}

async function keyPrefixSearch(
  table: "sat_claves" | "sat_unidades",
  prefix: string,
  limit: number
): Promise<SatCatalogResult[]> {
  const result = await db.execute<SatCatalogResult>(sql`
    SELECT key, description
    FROM ${sql.raw(table)}
    WHERE key LIKE ${`${prefix}%`}
    LIMIT ${limit}
  `);
  return result.rows;
}

export async function searchSatClaves(q: string): Promise<SatCatalogResult[]> {
  if (!q || q.trim().length < 2) return [];
  const query = q.trim();

  if (/^[0-9A-Z]+$/.test(query)) {
    const rows = await keyPrefixSearch("sat_claves", query, 25);
    if (rows.length > 0) return rows;
  }

  const words = extractWords(query);
  if (words.length === 0) return [];
  return ftsSearch("sat_claves", words, 25, true);
}

export async function searchSatUnidades(q: string): Promise<SatCatalogResult[]> {
  if (!q || q.trim().length < 1) return [];
  const query = q.trim();

  if (/^[0-9A-Za-z]+$/.test(query) && query.length <= 5) {
    const rows = await keyPrefixSearch("sat_unidades", query.toUpperCase(), 15);
    if (rows.length > 0) return rows;
  }

  const words = extractWords(query);
  if (words.length === 0) return [];
  return ftsSearch("sat_unidades", words, 15, true);
}

// Used by the Gemini automap tool functions — same underlying search, but
// AND-first (prefer_or=False) like the old app's automap tool calls, and
// with the old code's per-tool word-length gates ([a-z]{3,} for products,
// [a-z]{2,} for units) instead of the interactive-search gates above.
export async function searchSatCatalogForAutomap(q: string): Promise<SatCatalogResult[]> {
  const words = normalize(q).match(/[a-z]{3,}/g) ?? [];
  if (words.length === 0) return [];
  return ftsSearch("sat_claves", words, 25, false);
}

export async function searchSatUnitsForAutomap(q: string): Promise<SatCatalogResult[]> {
  const words = normalize(q).match(/[a-z]{2,}/g) ?? [];
  if (words.length === 0) return [];
  return ftsSearch("sat_unidades", words, 15, false);
}
