import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanStr(v: any) {
  return (v ?? '').toString().trim();
}

function cleanId(v: any) {
  return cleanStr(v).replace(/[<>\s]/g, '');
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  let body: any = null;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const actionId =
      cleanId(body?.actionId) ||
      cleanId(body?.action_id) ||
      cleanId(body?.availabilityActionId) ||
      cleanId(body?.availability_action_id);

    const customerName = cleanStr(body?.name || body?.customer_name);
    const customerContact = cleanStr(body?.contact || body?.customer_contact);

    if (!actionId) {
      return NextResponse.json({ error: 'Missing actionId' }, { status: 400 });
    }

    if (!customerName && !customerContact) {
      return NextResponse.json(
        { error: 'Nothing to save. Provide at least a name or contact.' },
        { status: 400 }
      );
    }

    if (customerName.length > 120) {
      return NextResponse.json({ error: 'Name is too long.' }, { status: 400 });
    }

    if (customerContact.length > 120) {
      return NextResponse.json({ error: 'Contact is too long.' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('availability_actions')
      .select('id, customer_name, customer_contact, meta')
      .eq('id', actionId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message || 'Could not verify availability action.' },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json({ error: 'Availability action not found.' }, { status: 404 });
    }

    const nextMeta =
      existing.meta && typeof existing.meta === 'object'
        ? {
            ...existing.meta,
            contact_capture_source: 'tag_page',
            contact_capture_at: new Date().toISOString(),
          }
        : {
            contact_capture_source: 'tag_page',
            contact_capture_at: new Date().toISOString(),
          };

    const patch: Record<string, any> = {
      meta: nextMeta,
    };

    if (customerName) patch.customer_name = customerName;
    if (customerContact) patch.customer_contact = customerContact;

    const { error: updateError } = await supabaseAdmin
      .from('availability_actions')
      .update(patch)
      .eq('id', actionId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to save contact details.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      actionId,
      saved: {
        customer_name: customerName || existing.customer_name || null,
        customer_contact: customerContact || existing.customer_contact || null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
  }
}