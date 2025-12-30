import PrintClient from './_client';

export default function Page({ params }: { params: { id: string } }) {
  const raw = decodeURIComponent(params.id || '').trim();
  const cleanId = raw.startsWith('tag/') ? raw.slice(4) : raw;
  return <PrintClient tagId={cleanId} />;
}

