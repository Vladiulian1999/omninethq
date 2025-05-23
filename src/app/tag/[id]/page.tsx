'use client';

export default function Page({ params }: { params: { id: string } }) {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Dynamic Tag Page</h1>
      <p>You are viewing tag: <strong>{params.id}</strong></p>
    </main>
  );
}
