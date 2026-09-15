// Shared limits for sample pedimento/factura uploads (issue #32/#33) — kept
// in one place so the client-side pre-check and the server-side guarantee
// can't drift apart.
export const MAX_SAMPLE_FILES = 10;
export const MAX_SAMPLE_BYTES = 20 * 1024 * 1024;

export function validateSampleFiles(files: { type: string; size: number }[]): string | null {
  if (files.length === 0) return "Selecciona al menos un archivo";
  if (files.length > MAX_SAMPLE_FILES) return `Máximo ${MAX_SAMPLE_FILES} archivos por envío`;
  if (files.some((f) => f.type !== "application/pdf")) return "Solo se permiten archivos PDF";
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_SAMPLE_BYTES) return "El envío supera los 20MB en total";
  return null;
}
