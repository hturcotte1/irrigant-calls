import "server-only";
import { env } from "@/lib/env";
import { DemoStore } from "./demo";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export { PAGE_SIZE } from "./types";
export type { Store, CallWithContact, Facets } from "./types";

let store: Store | null = null;

/** Supabase in real use; made-up farms when DEMO_MODE=1. */
export function getStore(): Store {
  if (store) return store;
  if (env.demo) return (store = new DemoStore());
  if (!env.supabaseUrl || !env.supabaseKey) {
    throw new Error("The database isn't connected: set SUPABASE_URL and SUPABASE_SECRET_KEY (or set DEMO_MODE=1 to try it with sample farms).");
  }
  return (store = new SupabaseStore(env.supabaseUrl, env.supabaseKey));
}
