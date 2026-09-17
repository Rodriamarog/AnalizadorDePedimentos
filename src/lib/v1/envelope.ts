import { NextResponse } from "next/server";

export interface ApiErrorDetail {
  field?: string;
  issue: string;
}

// The shared error envelope every /api/v1 response uses (#38):
// { "error": { "code", "message", "details": [{ "field", "issue" }] } }.
export function apiError(
  status: number,
  code: string,
  message: string,
  details?: ApiErrorDetail[]
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  );
}

// Unpaginated list envelope, e.g. the catalog search endpoints.
export function apiList<T>(data: T[]): NextResponse {
  return NextResponse.json({ data });
}

export interface PageMeta {
  limit: number;
  offset: number;
  total: number;
}

// Paginated list envelope — pairs with parsePagination() below.
export function apiPage<T>(data: T[], meta: PageMeta): NextResponse {
  return NextResponse.json({ data, meta });
}
