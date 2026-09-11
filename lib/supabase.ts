export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

export function getSupabaseRestUrl(path = "") {
  if (!supabaseConfig.url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return `${supabaseConfig.url}/rest/v1${path}`;
}
