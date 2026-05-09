import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in .env");
if (!serviceRoleKey) {
  console.error(`
SUPABASE_SERVICE_ROLE_KEY is missing or empty in .env.

Add the service_role key (not the anon key):
  Supabase Dashboard → your project → Project Settings → API → Project API keys → service_role

Never commit this key or expose it in the browser; it bypasses Row Level Security.
`);
  process.exit(1);
}

const email = process.env.NEW_CAPTAIN_EMAIL ?? "abdullahkhawaja@gmail.com";
const password = process.env.NEW_CAPTAIN_PASSWORD ?? "catsanddogs";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { role: "captain" },
});

if (error) {
  console.error("Failed to create captain user:", error.message);
  process.exit(1);
}

console.log("Created captain user:", {
  id: data.user?.id,
  email: data.user?.email,
  role: data.user?.user_metadata?.role,
});

