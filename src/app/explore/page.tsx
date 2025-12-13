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

function getEnv(name: string) {
  const v = process.env[name];
  return v && v.trim().length ? v : undefined;
}

export default async function ExplorePage() {
  const url =
    getEnv("SUPABASE_URL") ?? getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon =
    getEnv("SUPABASE_ANON_KEY") ?? getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !anon) {
    return (
      <div className="p-6 text-red-600">
        Missing Supabase env vars. Check .env.local / Vercel env.
      </div>
    );
  }

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
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Explore</h1>

      {tags.length === 0 ? (
        <div className="text-gray-600">No tags yet.</div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {tags.map((t) => (
            <li key={t.id} className="border rounded-2xl p-4 bg-white shadow-sm">
              <Link
                href={`/tag/${encodeURIComponent(t.id)}`}
                className="font-semibold hover:underline"
              >
                {t.title || t.id}
              </Link>

              {t.description ? (
                <div className="text-sm text-gray-600 mt-1 line-clamp-2">
                  {t.description}
                </div>
              ) : null}

              <div className="text-xs text-gray-500 mt-2">
                {(t.category ?? "uncategorized")} •{" "}
                {new Date(t.created_at).toLocaleDateString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


