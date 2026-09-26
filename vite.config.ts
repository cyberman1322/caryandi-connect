// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Public Supabase settings baked into the browser code. They normally come from .env; on
// Vercel the Supabase integration provides SUPABASE_URL / SUPABASE_ANON_KEY, so fall back to
// those. Only the public URL and anon key are used here — never a service-role or secret key.
const fileEnv = loadEnv(process.env.NODE_ENV === "development" ? "development" : "production", process.cwd(), "VITE_");
const pick = (...values: Array<string | undefined>) => values.find((v) => typeof v === "string" && v.trim() !== "")?.trim() ?? "";
const supabaseUrl = pick(process.env.VITE_SUPABASE_URL, fileEnv.VITE_SUPABASE_URL, process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = pick(
  process.env.VITE_SUPABASE_ANON_KEY,
  fileEnv.VITE_SUPABASE_ANON_KEY,
  process.env.SUPABASE_ANON_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

let supabaseHost = "MISSING";
try {
  if (supabaseUrl) supabaseHost = new URL(supabaseUrl).host;
} catch {
  supabaseHost = "INVALID URL";
}
console.info(
  `[config] Supabase for the browser: ${supabaseHost}, anon key ${supabaseAnonKey ? "set" : "MISSING"} ` +
    `(VITE_ keys from .env: ${Object.keys(fileEnv).join(", ") || "none"})`,
);

export default defineConfig({
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey),
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
