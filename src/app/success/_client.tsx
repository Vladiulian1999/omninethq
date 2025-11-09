'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { BackButton } from "@/components/BackButton";
import { logEvent } from "@/lib/analytics"; // ✅ use shared analytics logger

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

type VariantKey = "InviteFriend" | "SupportLocal" | "DiscoverMore";

const VARIANTS: Record<VariantKey, { title: string; body: (tagTitle?: string|null)=>string; cta: string }> = {
  InviteFriend: {
    title: "Share the love 💌",
    body: (t) => t ? `Invite a friend to try “${t}” on OmniNet.` : "Invite a friend to try this OmniTag on OmniNet.",
    cta: "Share this tag",
  },
  SupportLocal: {
    title: "Help it grow 🌱",
    body: (t) => t ? `Share “${t}” — support local skills & services.` : "Share this tag — support local skills & services.",
    cta: "Share to friends",
  },
  DiscoverMore: {
    title: "Know someone who’d love this? ✨",
    body: (t) => t ? `Pass “${t}” along — it might be perfect for them.` : "Pass this along — it might be perfect for them.",
    cta: "Share with a friend",
  },
};

export default function SuccessClient({
  sessionId,
  tagFromQS,
  chFromQS, // ✅ channel from /success?ch=...
}: {
  sessionId: string;
  tagFromQS?: string;
  chFromQS?: string;
}) {
  const [info, setInfo] = useState<SuccessInfo | null>(null);
  const [tagTitle, setTagTitle] = useState<string | null>(null);
  const [refUsername, setRefUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://omninethq.co.uk";

  // Assign a sticky A/B variant per device
  const [variant, setVariant] = useState<VariantKey>("InviteFriend");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = "exp_success_share_variant";
    const existing = window.localStorage.getItem(key) as VariantKey | null;
    if (existing && VARIANTS[existing]) {
      setVariant(existing);
      return;
    }
    const keys: VariantKey[] = ["InviteFriend", "SupportLocal", "DiscoverMore"];
    const pick = keys[Math.floor(Math.random() * keys.length)];
    window.localStorage.setItem(key, pick);
    setVariant(pick);
  }, []);

  // Load Stripe session details (via our secure API route)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const url = sessionId ? `/api/success?session_id=${encodeURIComponent(sessionId)}` : `/api/success`;
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
    return () => { mounted = false; };
  }, [sessionId]);

  // Fetch tag title
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

  // Resolve referrer display name from refCode
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

  const tagIdClean = useMemo(
    () => (info?.tagId || tagFromQS || "").replace(/[<>\s]/g, ""),
    [info?.tagId, tagFromQS]
  );

  const tagUrl = useMemo(() => {
    return tagIdClean ? `${origin}/tag/${tagIdClean}` : `${origin}/explore`;
  }, [tagIdClean, origin]);

  // --- analytics helpers (success page specific) ---
  const track = async (event_type: string, extra?: Record<string, any>) => {
    try {
      await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type,
          page: "/success",
          variant,
          tag_id: tagIdClean || null,
          ref_code: (info?.refCode || null),
          session_id: sessionId || null,
          meta: extra || null,
        }),
      });
    } catch {}
  };

  // ✅ Log checkout_success exactly once per Stripe session
  useEffect(() => {
    if (!tagIdClean || !sessionId) return;
    const key = `omninet_cs_${sessionId}`;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(key)) return;

    const ch = (chFromQS || "direct").toString();
    (async () => {
      try {
        await logEvent('checkout_success' as any, {
          tag_id: tagIdClean,
          channel: ch,
        });
        localStorage.setItem(key, '1');
      } catch {
        // swallow errors
      }
    })();
  }, [tagIdClean, sessionId, chFromQS]);

  // impression fire once for success page CTA block
  useEffect(() => {
    if (!loading) {
      track("success_cta_impression");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, variant, tagIdClean]);

  // --- Share CTA handlers ---
  const handleShareTag = async () => {
    await track("success_cta_click", { action: "share" });
    try {
      const title = tagTitle
        ? `Check out "${tagTitle}" on OmniNet`
        : "Check out this OmniTag on OmniNet";
      if (typeof navigator !== "undefined" && "share" in navigator && (navigator as any).share) {
        await (navigator as any).share({ title, url: tagUrl });
        return;
      }
      await navigator.clipboard.writeText(tagUrl);
      alert("🔗 Link copied to clipboard!");
    } catch {
      alert("Could not share right now.");
    }
  };

  const handleCopyTagLink = async () => {
    await track("success_cta_click", { action: "copy" });
    try {
      await navigator.clipboard.writeText(tagUrl);
      alert("🔗 Link copied to clipboard!");
    } catch {
      alert("Could not copy link.");
    }
  };

  const handlePrintQR = async () => {
    await track("success_cta_click", { action: "print_qr" });
    // navigation handled by Link
  };

  const v = VARIANTS[variant];

  return (
    <div className="p-8 max-w-2xl mx-auto text-center">
      <BackButton />

      <h1 className="text-3xl font-bold mt-4 mb-2">Thank you! 🎉</h1>

      {loading && <p className="text-gray-600">Confirming your payment…</p>}

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

          {/* --- A/B: Share this tag --- */}
          {tagIdClean && (
            <div className="mt-6 border rounded-2xl p-4 bg-white shadow-sm">
              <h3 className="font-semibold mb-1">{v.title}</h3>
              <p className="text-sm text-gray-600">{v.body(tagTitle)}</p>
              <p className="text-xs text-gray-400 break-all mt-1">{tagUrl}</p>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={handleShareTag}
                  className="border rounded-xl px-4 py-2 text-sm hover:bg-gray-50"
                >
                  📣 {v.cta}
                </button>
                <button
                  onClick={handleCopyTagLink}
                  className="border rounded-xl px-4 py-2 text-sm hover:bg-gray-50"
                >
                  🔗 Copy link
                </button>
                <Link
                  href={`/tag/${tagIdClean}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handlePrintQR}
                  className="border rounded-xl px-4 py-2 text-sm hover:bg-gray-50"
                >
                  🖨️ Print QR
                </Link>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href={tagUrl} className="border rounded-xl px-4 py-2 hover:bg-gray-50">
              View the tag
            </Link>
            <Link href="/explore" className="border rounded-xl px-4 py-2 hover:bg-gray-50">
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

