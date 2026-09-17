import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/(.*)",
  // /api/v1 authenticates via its own Bearer API key (#35), not a Clerk
  // session — external callers won't have one. /api-docs (Scalar) and the
  // spec it reads must be reachable the same way.
  "/api/v1/(.*)",
  "/api-docs(.*)",
]);
const isOrgSelectionRoute = createRouteMatcher(["/select-org(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId, orgId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  if (!orgId && !isOrgSelectionRoute(req)) {
    return NextResponse.redirect(new URL("/select-org", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
