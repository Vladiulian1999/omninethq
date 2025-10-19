// Server component
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

type Tag = {
  id: string;
  title: string;
  description: string;
  category: string;
  views: number | null;
  featured: boolean | null;
  hidden: boolean | null;
  created_at: string;
};

export default async function ExplorePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,        // public url is fine on server
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!    // anon key (NOT service role)
  );

  // Only visible tags
  const { data, error } = await supabase
    .from("messages")
    .select("id,title,description,category,views,featured,hidden,created_at")
    .eq("hidden", false)
    .limit(200);

  if (error) {
    // minimal error surface
    return <div className="p-6 text-red-600">Error loading tags: {error.message}</div>;
  }

  const tags = (data || []) as Tag[];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Explore</h1>
      {tags.length === 0 ? (
        <div className="text-gray-600">No tags yet.</div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {tags.map(t => (
            <li key={t.id} className="border rounded-2xl p-4 bg-white shadow-sm">
              <a href={`/tag/${encodeURIComponent(t.id)}`} className="font-semibold hover:underline">
                {t.title}
              </a>
              <div className="text-sm text-gray-600 mt-1 line-clamp-2">{t.description}</div>
              <div className="text-xs text-gray-500 mt-2">
                {t.category} • {new Date(t.created_at).toLocaleDateString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

