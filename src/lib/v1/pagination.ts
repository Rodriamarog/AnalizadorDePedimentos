import { NextRequest, NextResponse } from "next/server";
import { apiError } from "./envelope";

export interface Pagination {
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Shared `limit`/`offset` pagination convention for /api/v1 list endpoints
// (#38). Returns the standard error envelope on out-of-range input instead
// of silently clamping, so a client typo doesn't come back as a
// confusingly-truncated page.
export function parsePagination(req: NextRequest): Pagination | NextResponse {
  const params = req.nextUrl.searchParams;
  const rawLimit = params.get("limit");
  const rawOffset = params.get("offset");

  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return apiError(400, "invalid_parameter", `limit must be an integer between 1 and ${MAX_LIMIT}`, [
        { field: "limit", issue: "out_of_range" },
      ]);
    }
  }

  let offset = 0;
  if (rawOffset !== null) {
    offset = Number(rawOffset);
    if (!Number.isInteger(offset) || offset < 0) {
      return apiError(400, "invalid_parameter", "offset must be a non-negative integer", [
        { field: "offset", issue: "out_of_range" },
      ]);
    }
  }

  return { limit, offset };
}
