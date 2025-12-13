// src/app/explore/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type Tag = {
  id: string;
  title: string;
  description: string;
  category: string;
  created_at: string;
};

export default async function ExplorePage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return (
      <div className="p-6 text-red-600">
        Supabase environment variables are missing.
      </div>
    );
  }

  const supabase = createClient(supabaseUrl, anonKey);

  const { data, error } = await supabase
    .from("messages")
    .select("id,title,description,category,created_at")
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

  if (!data || data.length === 0) {
    return (
      <div className="p-6 text-gray-600">
        No tags yet.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Explore</h1>
      <ul className="grid gap-4 sm:grid-cols-2">
        {data.map((t) => (
          <li key={t.id} className="border rounded-2xl p-4 bg-white shadow-sm">
            <Link
              href={`/tag/${encodeURIComponent(t.id)}`}
              className="font-semibold hover:underline"
            >
              {t.title}
            </Link>
            <div className="text-sm text-gray-600 mt-1 line-clamp-2">
              {t.description}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {t.category} • {new Date(t.created_at).toLocaleDateString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

