import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Route handlers sit behind the proxy's auth+org gate already, but this is
 * the defense-in-depth check: never trust an org id from client input, only
 * from the server-side Clerk session.
 */
export async function requireOrgId(): Promise<string | NextResponse> {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 401 });
  }
  return orgId;
}
