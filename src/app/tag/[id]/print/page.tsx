import { Suspense } from 'react';
import TagClient from './_client';

export const runtime = 'nodejs';

export default function Page({ params }: { params: { id: string } }) {
  return (
    <Suspense>
      <TagClient tagId={params.id} />
    </Suspense>
  );
}

