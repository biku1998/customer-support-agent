export { getSupabaseClient, createClient } from "./client.js";
export type { TypedSupabaseClient } from "./client.js";
export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./database.types.js";

// Import for local use
import type { Tables, TablesInsert } from "./database.types.js";

// Convenience types for tables
export type Technote = Tables<"technotes">;
export type TechnoteInsert = TablesInsert<"technotes">;
export type TechnoteSection = Tables<"technote_sections">;
export type TechnoteSectionInsert = TablesInsert<"technote_sections">;
export type QaDev = Tables<"qa_dev">;
export type QaDevInsert = TablesInsert<"qa_dev">;
