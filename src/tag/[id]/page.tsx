import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

export default async function TagPage({ params }: { params: { id: string } }) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <h1 className="text-xl font-semibold text-red-500">Tag Not Found</h1>
      </div>
    );
  }

  return (
    <div className="p-6 text-center">
      <h1 className="text-2xl font-bold">Service</h1>
      <p className="mt-4 text-gray-600">{data.content}</p>
    </div>
  );
}
