// Local format validation for RFC and código postal (#71) — catches an
// obviously malformed value with the app's own `invalid_parameter` error
// before it ever reaches FacturAPI.
//
// Deliberately format-only, not a full SAT check-digit (homoclave)
// verification: this repo's own test fixtures (and, in practice, a lot of
// real-world sandbox/demo data) use well-formed but not checksum-valid
// RFCs — enforcing the checksum would reject those as "invalid" even
// though FacturAPI itself accepts them. Format + a plausible embedded date
// already catches the common malformed-input case (typos, wrong length,
// digits/letters transposed) without risking false rejections of RFCs
// that are merely checksum-mismatched.
//
// SAT's two reserved "generic" RFCs — used for público en general and
// extranjero transactions — are accepted unconditionally, since their
// homoclave ("000") isn't a real check digit to begin with.
const GENERIC_RFCS = new Set(["XAXX010101000", "XEXX010101000"]);

// Persona moral: 3 letters + YYMMDD + 3-char alphanumeric homoclave (12).
// Persona física: 4 letters + YYMMDD + 3-char alphanumeric homoclave (13).
const RFC_PATTERN = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z0-9]{3})$/;

function hasValidDateSegment(yy: string, mm: string, dd: string): boolean {
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Full calendar validation (leap years, 30 vs 31 day months) needs a
  // century to disambiguate YY, which the RFC alone doesn't carry —
  // month/day range checks catch the malformed cases (#71 asks for
  // "clear field/issue" rejection, not a full calendar validator).
  return /^\d{2}$/.test(yy);
}

export function isValidRfc(value: string): boolean {
  const rfc = value.trim().toUpperCase();
  if (GENERIC_RFCS.has(rfc)) return true;

  const match = RFC_PATTERN.exec(rfc);
  if (!match) return false;

  const [, , yy, mm, dd] = match;
  return hasValidDateSegment(yy, mm, dd);
}

const CODIGO_POSTAL_PATTERN = /^\d{5}$/;

export function isValidCodigoPostal(value: string): boolean {
  return CODIGO_POSTAL_PATTERN.test(value.trim());
}
