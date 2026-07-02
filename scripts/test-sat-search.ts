// One-off verification of the ported catalog search logic against real seeded data.
import { searchSatClaves, searchSatUnidades } from "../src/lib/satSearch";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  // key prefix match
  const byPrefix = await searchSatClaves("2410");
  assert(byPrefix.length > 0, "key prefix '2410' returns results");
  assert(
    byPrefix.every((r) => r.key.startsWith("2410")),
    "all key-prefix results actually start with 2410"
  );

  // free-text search, accent-insensitive
  const camion = await searchSatClaves("camion");
  const camionAccented = await searchSatClaves("camión");
  assert(camion.length > 0, "free-text 'camion' returns results");
  assert(camionAccented.length > 0, "free-text 'camión' (accented) returns results");
  assert(
    camion.map((r) => r.key).join(",") === camionAccented.map((r) => r.key).join(","),
    "accented and unaccented queries return the same results"
  );

  // too-short query gates
  const tooShort = await searchSatClaves("a");
  assert(tooShort.length === 0, "single-char product query returns empty (matches old q.length<2 gate)");

  // units: key prefix
  const h87 = await searchSatUnidades("h87");
  assert(h87.length > 0, "unit key prefix 'h87' (lowercase) returns results via uppercase normalization");
  assert(h87.some((r) => r.key === "H87"), "H87 itself is in the results");

  // units: free text
  const kilogramo = await searchSatUnidades("kilogramo");
  assert(kilogramo.length > 0, "unit free-text 'kilogramo' returns results");

  // empty query gates
  const empty = await searchSatUnidades("");
  assert(empty.length === 0, "empty unit query returns empty");

  console.log("All SAT catalog search assertions passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
