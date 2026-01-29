/**
 * Smoke test to verify Supabase connection
 * Run with: pnpm --filter @pkg/db smoke
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  console.log("🔌 Connecting to Supabase...");

  const url = process.env["SUPABASE_URL"];
  const key =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"];

  if (!url || !key) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  // Use a simple query to test connection
  // We query a non-existent table - if we get "table not found" error, connection works
  const { error } = await supabase.from("_test").select("*").limit(0);

  // These errors indicate the connection worked but table doesn't exist (expected)
  const tableNotFoundErrors = ["PGRST116", "42P01"];
  const isTableNotFound =
    error?.code && tableNotFoundErrors.includes(error.code);
  const isSchemaNotFound = error?.message?.includes("Could not find");

  if (error && !isTableNotFound && !isSchemaNotFound) {
    console.error("❌ Supabase connection failed:", error.message);
    process.exit(1);
  }

  console.log("✅ Supabase connection successful!");
  console.log("   URL:", url);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  process.exit(1);
});
