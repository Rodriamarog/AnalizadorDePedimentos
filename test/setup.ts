import "dotenv/config";
import { config } from "dotenv";

// Load .env.local the same way `next dev` does — vitest doesn't know about
// Next's env loading, and the v1 routes need DATABASE_URL, APP_DATABASE_URL,
// FACTURAPI_KEY_ENCRYPTION_SECRET and FACTURAPI_TEST_API_KEY.
config({ path: ".env.local", override: false });
