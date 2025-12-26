import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bool(v: string | undefined) {
  return !!(v && v.trim().length > 0);
}

export async function GET() {
  return NextResponse.json({
    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: bool(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: bool(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: bool(process.env.SUPABASE_SERVICE_ROLE_KEY),

    // Stripe
    STRIPE_SECRET_KEY: bool(process.env.STRIPE_SECRET_KEY),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: bool(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    STRIPE_WEBHOOK_SECRET: bool(process.env.STRIPE_WEBHOOK_SECRET),

    // Build/runtime info
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: bool(process.env.VERCEL),
    VERCEL_ENV: process.env.VERCEL_ENV ?? null,
  });
}

