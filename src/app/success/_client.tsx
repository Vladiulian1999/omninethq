'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { BackButton } from "@/components/BackButton";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type SuccessInfo = {
  ok: boolean;
  amount_cents?: number;
  currency?: string;
  tagId?: string | null;
  refCode?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  error?: string;
};

export default function SuccessClient({
  sessionId,
  tagFromQS,
}: {
  sessionId: string;
  tagFromQS?: string;
}) {
  const [info, setInfo] = useState<SuccessInfo | null>(null);
  const [tagTitle, setTagTitle] = useState<string | null>(null);
  const [refUsername, setRefUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://omninethq.co.uk";

  // Load Stripe session details (via our secure API route)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const url = sessionId
          ? `/api/success?session_id=${encodeURIComponent(sessionId)}`
          : `/api/success`;
        const res = await fetch(url, { cache: "no-store" });
        const data = (await res.json()) as SuccessInfo;
        if (!mounted) return;
        setInfo(data);
      } catch (e: any) {
        if (!mounted) return;
        setInfo({ ok: false, error: e?.message || "Failed to load" });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  // Fetch tag title (by id from metadata or query fallback)
  useEffect(() => {
    (async () => {
      const id = (info?.tagId || tagFromQS || "").replace(/[<>\s]/g, "");
      if (!id) return;
      const { data } = await supabase
        .from("messages")
        .select("title")
        .eq("id", id)
        .maybeSingle();
      setTagTitle(data?.title || null);
    })();
  }, [info?.tagId, tagFromQS]);

  // Resolve referrer display name from refCode → users.username (fallback to email prefix)
  useEffect(() => {
    (async () => {
      const code = (info?.refCode || "").toLowerCase().trim();
      if (!code) return;
      const { data } = await supabase
        .from("users")
        .select("username, email")
        .eq("referral_code", code)
        .maybeSingle();
      if (data) {
        const disp =
          (data.username && data.username.trim()) ||
          (data.email ? data.email.split("@")[0] : null);
        setRefUsername(disp || null);
      }
    })();
  }, [info?.refCode]);

  const amountGBP = useMemo(() => {
    if (!info?.amount_cents) return null;
    return `£${(info.amount_cents / 100).toFixed(2)}`;
  }, [info?.amount_cents]);

  const tagUrl = useMemo(() => {
    const id = (info?.tagId || tagFromQS || "").replace(/[<>\s]/g, "");
    return id ? `${origin}/tag/${id}` : `${origin}/explore`;
  }, [info?.tagId, tagFromQS, origin]);

  return (
    <div className="p-8 max-w-2xl mx-auto text-center">
      <BackButton />

      <h1 className="text-3xl font-bold mt-4 mb-2">Thank you! 🎉</h1>

      {loading && (
        <p className="text-gray-600">Confirming your payment…</p>
      )}

      {!loading && info?.ok && (
        <>
          <p className="text-gray-700">
            {amountGBP ? `You donated ${amountGBP}. ` : "Your donation was received. "}
            {tagTitle ? (
              <>
                You supported <span className="font-semibold">{tagTitle}</span>.
              </>
            ) : (
              <>Thanks for supporting this tag.</>
            )}
          </p>

          {info.refCode && (
            <p className="mt-2 text-gray-600">
              Referred by{" "}
              <span className="font-semibold">
                {refUsername ? `@${refUsername}` : info.refCode}
              </span>
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={tagUrl}
              className="border rounded-xl px-4 py-2 hover:bg-gray-50"
            >
              View the tag
            </Link>
            <Link
              href="/explore"
              className="border rounded-xl px-4 py-2 hover:bg-gray-50"
            >
              Explore more
            </Link>
          </div>

          <div className="mt-8 border rounded-2xl p-4 text-left bg-white shadow-sm">
            <h3 className="font-semibold mb-2">Receipt</h3>
            <div className="text-sm text-gray-700 space-y-1">
              {info.customer_name && <div>Donor: {info.customer_name}</div>}
              {info.customer_email && <div>Email: {info.customer_email}</div>}
              {amountGBP && <div>Amount: {amountGBP}</div>}
              <div>Session ID: {sessionId || "—"}</div>
            </div>
          </div>
        </>
      )}

      {!loading && !info?.ok && (
        <>
          <p className="text-red-600">We couldn’t verify your payment.</p>
          {info?.error && <p className="text-gray-500 mt-1">{info.error}</p>}
          <div className="mt-4">
            <Link href="/explore" className="border rounded-xl px-4 py-2 hover:bg-gray-50">
              Back to Explore
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
