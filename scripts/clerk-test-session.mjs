// Mints a real Clerk session cookie for local testing, so curl/scripts can
// hit authenticated routes without going through the browser sign-in flow.
// Not used by the app itself - dev tooling only.
import { createClerkClient } from "@clerk/backend";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const frontendApiHost = Buffer.from(publishableKey.split("_")[2], "base64")
  .toString("utf8")
  .replace(/\$/g, "");

async function main() {
  const userIdArg = process.argv[2];
  let userId = userIdArg;
  if (!userId) {
    const { data: users } = await clerkClient.users.getUserList({ limit: 1 });
    if (users.length === 0) throw new Error("No Clerk users found - pass a userId explicitly.");
    userId = users[0].id;
    console.error(`No userId given, using first user: ${userId} (${users[0].emailAddresses[0]?.emailAddress})`);
  }

  // Dev instances require a "dev browser" handshake token in addition to the
  // session - without it, Clerk's middleware treats the request as signed-out
  // with reason "dev-browser-missing", even with a valid __session cookie.
  const devBrowserRes = await fetch(`https://${frontendApiHost}/v1/dev_browser`, { method: "POST" });
  const devBrowser = await devBrowserRes.json();

  const signInToken = await clerkClient.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 300,
  });

  const res = await fetch(`https://${frontendApiHost}/v1/client/sign_ins`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ strategy: "ticket", ticket: signInToken.token }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(body);
    throw new Error(`Sign-in redemption failed: ${res.status}`);
  }

  const sessionId = body.response.created_session_id;
  const session = await clerkClient.sessions.getToken(sessionId);
  const clientUat = Math.floor(Date.now() / 1000);

  console.log(
    `Cookie: __session=${session.jwt}; __client_uat=${clientUat}; __clerk_db_jwt=${devBrowser.token}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
