import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";

export type TypedSupabaseClient = SupabaseClient<Database>;

let client: TypedSupabaseClient | null = null;

export function getSupabaseClient(): TypedSupabaseClient {
  if (client) return client;

  const url = process.env["SUPABASE_URL"];
  const key =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"];

  if (!url) {
    throw new Error("SUPABASE_URL environment variable is required");
  }
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY environment variable is required"
    );
  }

  client = createClient<Database>(url, key);
  return client;
}

export { createClient };
