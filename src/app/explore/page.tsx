// src/app/explore/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type Tag = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  views: number | null;
  featured: boolean | null;
  hidden: boolean | null;
  created_at: string;
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v.trim();
}

export default async function ExplorePage() {
  // Fail fast with a clear server-rendered error (instead of silent weirdness)
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const supabase = createClient(url, anon);

  const { data, error } = await supabase
    .from("messages")
    .select("id,title,description,category,views,featured,hidden,created_at")
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="p-6 text-red-600">
        Error loading tags: {error.message}
      </div>
    );
  }

  const tags = (data ?? []) as Tag[];

  return (
    <div className="min-h-screen bg-amber-50/60">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6 rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-amber-100/40 p-6 shadow-sm">
          <h1 className="text-3xl font-semibold text-amber-950">Explore</h1>
          <p className="mt-2 text-sm text-amber-900/70">
            Scan-first local services. Real availability. No waiting.
          </p>
        </div>

        {tags.length === 0 ? (
          <div className="text-amber-900/60">No tags yet.</div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {tags.map((t) => {
              const href = `/tag/${encodeURIComponent(t.id)}`;
              const category = t.category ?? "uncategorized";
              const created = new Date(t.created_at).toLocaleDateString();

              return (
                <li
                  key={t.id}
                  className="group rounded-2xl border border-amber-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <Link
                    href={href}
                    className="text-lg font-semibold leading-snug text-amber-950 hover:underline"
                  >
                    {t.title}
                  </Link>

                  {t.description ? (
                    <div className="mt-2 text-sm leading-relaxed text-amber-900/70 line-clamp-2">
                      {t.description}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-amber-900/60">
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900/80">
                      {category}
                    </span>
                    <span>{created}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
