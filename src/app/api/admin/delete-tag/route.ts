import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function parseAdminIds(val?: string) {
  return (val || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function looksLikeUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey) {
      return NextResponse.json(
        {
          ok: false,
          step: "missing_public_env",
          error: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
        },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      return NextResponse.json(
        { ok: false, step: "auth_error", error: userErr.message },
        { status: 401 }
      );
    }

    const user = userData?.user;
    if (!user) {
      return NextResponse.json({ ok: false, step: "no_user" }, { status: 401 });
    }

    const adminIds = parseAdminIds(process.env.ADMIN_USER_IDS);
    if (adminIds.length === 0) {
      return NextResponse.json({ ok: false, step: "missing_admin_env" }, { status: 403 });
    }

    if (!adminIds.includes(user.id)) {
      return NextResponse.json(
        { ok: false, step: "not_admin", userId: user.id },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const tagId = String(body?.tagId || "").trim();
    console.log('[admin delete] received tagId:', tagId);

    if (!tagId) {
      return NextResponse.json({ ok: false, step: "missing_tag_id" }, { status: 400 });
    }

    // This route now expects tags.id (UUID)
    if (!looksLikeUuid(tagId)) {
      return NextResponse.json(
        {
          ok: false,
          step: "wrong_id_type",
          error:
            "Refusing to delete: expected tags.id (UUID). Your client must send the tag row UUID, not messages.id text.",
          received: tagId,
        },
        { status: 400 }
      );
    }

    if (!serviceKey) {
      return NextResponse.json(
        { ok: false, step: "missing_service_env", error: "Missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    // Service role client (bypasses RLS) for admin delete
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });

    // Optional preflight: ensure tag exists in tags table
    const { data: tagRow, error: tagErr } = await admin
      .from("tags")
      .select("id, title")
      .eq("id", tagId)
      .maybeSingle();

    if (tagErr) {
      return NextResponse.json(
        { ok: false, step: "preflight_failed", error: tagErr.message },
        { status: 500 }
      );
    }

    if (!tagRow) {
      return NextResponse.json(
        { ok: false, step: "tag_not_found", error: "No row in public.tags with that UUID.", received: tagId },
        { status: 404 }
      );
    }

    // ✅ Call the UUID-based RPC
    const { data, error } = await admin.rpc("admin_delete_tag_cascade_by_uuid", {
      tag_uuid: tagId,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, step: "delete_failed", error: error.message, received: tagId },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data, deleted: tagId }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, step: "server_error", error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
