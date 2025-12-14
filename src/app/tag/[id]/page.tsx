import { Suspense } from "react";
import { redirect } from "next/navigation";
import TagClient from "./_client";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScanPoint = { date: string; count: number };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDecodeURIComponent(input: string) {
  try {
    return decodeURIComponent(input);
  } catch {
    return null;
  }
}

function ymd(d: Date) {
  const yr = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createClient(url, anon);
}

async function getTagScanStats(tagId: string): Promise<ScanPoint[]> {
  // If your scans.tag_id column is UUID, don’t trigger errors on non-UUIDs.
  if (!UUID.test(tagId)) return [];

  const supabase = getSupabase();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 60);

  const { data, error } = await supabase
    .from("scans")
    .select("created_at")
    .eq("tag_id", tagId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  const map = new Map<string, number>();
  for (const row of data as { created_at: string }[]) {
    const d = new Date(row.created_at);
    const key = ymd(d);
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, count]) => ({ date, count }));
}

async function resolveRealTagId(inputId: string): Promise<string | null> {
  const supabase = getSupabase();

  // 1) exact
  const exact = await supabase.from("messages").select("id").eq("id", inputId).maybeSingle();
  if (exact.data?.id) return exact.data.id;

  // 2) strip tag-
  if (inputId.startsWith("tag-")) {
    const noPrefix = inputId.slice(4);
    const a = await supabase.from("messages").select("id").eq("id", noPrefix).maybeSingle();
    if (a.data?.id) return a.data.id;
  } else {
    // 3) add tag-
    const withPrefix = `tag-${inputId}`;
    const b = await supabase.from("messages").select("id").eq("id", withPrefix).maybeSingle();
    if (b.data?.id) return b.data.id;
  }

  return null;
}

export default async function Page(props: {
  params: { id?: string } | Promise<{ id?: string }>;
}) {
  // Next 16 can hand you params in a way that behaves like a promise in some cases.
  const params = await props.params;

  const rawId = (params?.id ?? "").toString().trim();
  if (!rawId) redirect("/explore");

  const decoded = safeDecodeURIComponent(rawId);
  if (!decoded) redirect("/explore");

  const cleaned = decoded.trim();
  if (!cleaned || cleaned === "id" || cleaned === "undefined" || cleaned === "null") {
    redirect("/explore");
  }

  const realId = await resolveRealTagId(cleaned);
  if (!realId) redirect("/explore");

  const scanChartData = await getTagScanStats(realId);

  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <TagClient tagId={realId} scanChartData={scanChartData} />
    </Suspense>
  );
}
