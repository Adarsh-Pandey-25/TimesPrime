import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://qwemjarwmkvmuurvtkom.supabase.co";

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3ZW1qYXJ3bWt2bXV1cnZ0a29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0Mzc5NjIsImV4cCI6MjEwMjAxMzk2Mn0.iBrOKLVr4JAvFGS3Wve2vwa6ZRbH39nqpS1H-Qlmzp8";

export const supabase = createClient(supabaseUrl, supabaseKey);

export function isSupabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}
