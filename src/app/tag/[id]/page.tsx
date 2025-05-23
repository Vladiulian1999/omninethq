// src/app/tag/[id]/page.tsx

interface PageProps {
  params: {
    id: string;
  };
}

export default function TagPage({ params }: PageProps) {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Tag ID: {params.id}</h1>
      <p>This is a dynamic page for the tag "{params.id}"</p>
    </div>
  );
}

