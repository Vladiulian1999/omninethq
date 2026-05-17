// src/app/api/checkout/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { logOperationalEvent } from "@/lib/operationalEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2022-11-15",
});

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_SUPABASE_SERVICE_ROLE || // (harmless if undefined; keeps backward compat if you ever used it)
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE(_KEY) is missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

function makeIdempotencyKey(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function makePublicRef() {
  return `clm_${crypto.randomBytes(24).toString("base64url")}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message_id = String(body?.message_id ?? "").trim();
    const block_id = String(body?.block_id ?? "").trim();
    const quantityRaw = body?.quantity;

    const qty = Number(quantityRaw ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "quantity must be > 0" }, { status: 400 });
    }

    if (!message_id || !block_id) {
      return NextResponse.json(
        { error: "message_id and block_id required" },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();

    // Fetch block (must match tag + id)
    const { data: block, error: blockErr } = await supabase
      .from("availability_blocks")
      .select("*")
      .eq("id", block_id)
      .eq("tag_id", message_id)
      .single();

    if (blockErr || !block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    if (block.status !== "live") {
      return NextResponse.json({ error: "Block not live" }, { status: 400 });
    }

    if (block.capacity_remaining !== null && block.capacity_remaining < qty) {
      return NextResponse.json({ error: "Insufficient capacity" }, { status: 400 });
    }

    // Build stable-ish idempotency key.
    // NOTE: time-bucketed to avoid a key lasting forever, but still prevent double-click duplicates.
    const timeBucket = Math.floor(Date.now() / (60 * 1000)); // 1 minute
    const idempotency_key = makeIdempotencyKey(`${message_id}:${block_id}:${qty}:${timeBucket}`);

    // 1) Create (or reuse) availability action (idempotent by idempotency_key UNIQUE)
    let actionRow: any = null;
    const publicRef = makePublicRef();

    const { data: action, error: actionErr } = await supabase
      .from("availability_actions")
      .insert({
        tag_id: message_id,
        block_id,
        public_ref: publicRef,
        status: "pending", // allowed by your enum
        quantity: qty,
        idempotency_key,
        meta: {
          created_via: "api/checkout/create",
          idempotency_key,
        },
      })
      .select("*")
      .single();

    if (actionErr) {
      const msg = String((actionErr as any)?.message ?? "").toLowerCase();
      const code = String((actionErr as any)?.code ?? "");

      const isUnique = code === "23505" || msg.includes("unique") || msg.includes("duplicate");

      if (isUnique) {
        const { data: existing, error: exErr } = await supabase
          .from("availability_actions")
          .select("*")
          .eq("idempotency_key", idempotency_key)
          .maybeSingle();

        if (exErr || !existing) {
          return NextResponse.json(
            {
              error: "Failed to reuse existing action",
              postgres: {
                code,
                message: (actionErr as any)?.message,
                details: (actionErr as any)?.details,
                hint: (actionErr as any)?.hint,
              },
            },
            { status: 500 }
          );
        }

        actionRow = existing;
      } else {
        return NextResponse.json(
          {
            error: "Failed to create action",
            postgres: {
              code,
              message: (actionErr as any)?.message,
              details: (actionErr as any)?.details,
              hint: (actionErr as any)?.hint,
            },
          },
          { status: 500 }
        );
      }
    } else {
      actionRow = action;
    }

    if (!actionRow?.id) {
      return NextResponse.json({ error: "Action row missing id" }, { status: 500 });
    }

    if (!actionRow.public_ref) {
      const nextPublicRef = makePublicRef();
      const { data: patched, error: publicRefErr } = await supabase
        .from("availability_actions")
        .update({ public_ref: nextPublicRef })
        .eq("id", actionRow.id)
        .is("public_ref", null)
        .select("*")
        .maybeSingle();

      if (publicRefErr) {
        return NextResponse.json({ error: "Failed to create public claim reference" }, { status: 500 });
      }

      if (patched?.public_ref) actionRow = patched;
    }

    const claimRef = String(actionRow.public_ref ?? "").trim();
    if (!claimRef) {
      return NextResponse.json({ error: "Action row missing public_ref" }, { status: 500 });
    }

    const { data: claimedTransition, error: claimedTransitionErr } = await supabase.rpc("transition_action_claimed", {
      p_action_id: actionRow.id,
      p_action_type: String(block.action_type ?? "pay").toLowerCase(),
    });

    if (claimedTransitionErr) {
      const code = String((claimedTransitionErr as any)?.code ?? "");
      await logOperationalEvent({
        actionId: actionRow.id,
        publicRef: claimRef,
        eventType: "claim_transition_failed",
        actorType: "public",
        source: "api/checkout/create",
        success: false,
        correlationId: idempotency_key,
        payload: {
          block_id,
          tag_id: message_id,
          action_type: String(block.action_type ?? "pay").toLowerCase(),
          error: claimedTransitionErr.message,
          code,
        },
      });
      return NextResponse.json(
        {
          error: "Claim state transition failed",
          postgres: {
            code,
            message: claimedTransitionErr.message,
            details: (claimedTransitionErr as any)?.details,
            hint: (claimedTransitionErr as any)?.hint,
          },
        },
        { status: code === "P0002" ? 404 : 500 }
      );
    }

    actionRow = (claimedTransition as any)?.action ?? actionRow;
    await logOperationalEvent({
      actionId: actionRow.id,
      publicRef: claimRef,
      eventType: "claim_created",
      actorType: "public",
      source: "api/checkout/create",
      success: true,
      correlationId: idempotency_key,
      payload: {
        block_id,
        tag_id: message_id,
        action_type: String(block.action_type ?? "pay").toLowerCase(),
        quantity: qty,
      },
    });

    // 2) Create Stripe checkout session (idempotent too)
    const currency = String(block.currency || "gbp").toLowerCase();
    const unit_amount = Number(block.price_pence ?? 0);
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "";
    const successUrl = new URL("/success", origin || "https://omninethq.co.uk");
    successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    successUrl.searchParams.set("tag", message_id);
    successUrl.searchParams.set("claim", claimRef);

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: block.title || "Booking" },
              unit_amount,
            },
            quantity: qty,
          },
        ],
        success_url: successUrl.toString(),
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cancel`,
        metadata: {
          tagId: message_id,
          blockId: block_id,
          availabilityActionId: actionRow.id,
          idempotencyKey: idempotency_key,
        },
      },
      { idempotencyKey: `checkout_${idempotency_key}` }
    );

    const { data: checkoutTransition, error: actionUpdateErr } = await supabase.rpc("transition_checkout_created", {
      p_action_id: actionRow.id,
      p_stripe_checkout_session_id: session.id,
    });

    if (actionUpdateErr) {
      console.warn("Checkout action canonical update failed:", actionUpdateErr.message);
      const code = String((actionUpdateErr as any)?.code ?? "");
      const status = code === "23514" || code === "23505" ? 409 : code === "P0002" ? 404 : 500;
      await logOperationalEvent({
        actionId: actionRow.id,
        publicRef: claimRef,
        eventType: "checkout_transition_failed",
        actorType: "public",
        source: "api/checkout/create",
        success: false,
        correlationId: session.id,
        payload: {
          block_id,
          tag_id: message_id,
          stripe_checkout_session_id: session.id,
          error: actionUpdateErr.message,
          code,
        },
      });
      return NextResponse.json(
        {
          error: "Checkout state transition failed",
          postgres: {
            code,
            message: actionUpdateErr.message,
            details: (actionUpdateErr as any)?.details,
            hint: (actionUpdateErr as any)?.hint,
          },
        },
        { status }
      );
    }

    await logOperationalEvent({
      actionId: actionRow.id,
      publicRef: claimRef,
      eventType: "checkout_created",
      actorType: "public",
      source: "api/checkout/create",
      success: true,
      correlationId: session.id,
      payload: {
        block_id,
        tag_id: message_id,
        stripe_checkout_session_id: session.id,
        idempotent: Boolean((checkoutTransition as any)?.idempotent),
      },
    });

    return NextResponse.json({
      ok: true,
      checkout_url: session.url,
      claim_ref: claimRef,
      idempotency_key,
    });
  } catch (err: any) {
    console.error("Checkout error:", err?.message || err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


