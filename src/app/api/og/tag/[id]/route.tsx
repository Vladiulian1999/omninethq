import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge"; // or "nodejs" if you prefer Node
export const alt = "OmniNet Tag";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Edge-safe Supabase client using public env vars
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch } } // important on Edge
  );

  const id = decodeURIComponent(params.id);

  // defaults in case the tag isn't found or RLS blocks
  let title = "OmniNet Tag";
  let category = "Local Service";

  const { data } = await supabase
    .from("messages")
    .select("title, category")
    .eq("id", id)
    .maybeSingle();

  if (data?.title) title = data.title;
  if (data?.category) category = data.category;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
          fontSize: 48,
          background: "#ffffff",
          color: "#111111",
        }}
      >
        <div style={{ fontSize: 24, opacity: 0.6 }}>{category}</div>
        <div style={{ fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 28 }}>
          omninethq.co.uk/tag/{encodeURIComponent(id)}
        </div>
      </div>
    ),
    { ...size }
  );
}
