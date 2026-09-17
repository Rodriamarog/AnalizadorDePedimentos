import type { z } from "zod";
import { apiError } from "./envelope";
import type { NextResponse } from "next/server";

// Turns a failed zod parse into the standard invalid_parameter envelope,
// surfacing the first issue's field path (#71 — "clear field/issue"
// instead of a blanket "invalid") rather than a fixed placeholder message.
export function invalidBodyError(error: z.ZodError, fallbackMessage: string): NextResponse {
  const issue = error.issues[0];
  const field = issue?.path?.length ? issue.path.join(".") : undefined;
  return apiError(400, "invalid_parameter", issue?.message ?? fallbackMessage, [
    { field, issue: issue?.code === "custom" ? "invalid_format" : "invalid" },
  ]);
}
