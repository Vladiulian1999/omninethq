export default function TagPage({ params }: { params: { id: string } }) {
  return (
    <main>
      <h1>Tag: {params.id}</h1>
      <p>This is a dynamic tag page.</p>
    </main>
  );
}
