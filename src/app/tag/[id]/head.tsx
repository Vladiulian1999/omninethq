export default function Head({ params }: { params: { id: string } }) {
  const og = `https://omninethq.co.uk/api/og/tag/${encodeURIComponent(params.id)}`;
  return (
    <>
      <meta property="og:title" content="Discover local services on OmniNet" />
      <meta property="og:image" content={og} />
      <meta name="twitter:card" content="summary_large_image" />
    </>
  );
}
