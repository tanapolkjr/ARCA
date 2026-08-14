import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud failure on purpose — a silent missing-env-var bug is much harder to
  // debug than a crash at startup. Mirrors the 4 HAUS convention of baking
  // VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in at build time.
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in your Supabase project values."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// NOTE: the bucket id stays "smart-living-files" after the ARCA rename —
// renaming it would invalidate every file path already stored in the DB.
// Storage bucket used for ALL project/ticket file attachments (BOQ, PO,
// quotations, install photos, factory-file equivalents, etc.) — same
// "one bucket, path stored in DB" pattern as 4 HAUS's `product-media`.
export const FILES_BUCKET = "smart-living-files";
