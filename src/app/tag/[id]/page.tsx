'use client';

import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { FaMoneyBillWave, FaPhone, FaQrcode } from 'react-icons/fa';

interface TagPageProps {
  params: {
    id: string;
  };
}

export default async function TagPage({ params }: TagPageProps) {
  const { id } = params;

  const { data: tag, error } = await supabase
    .from('tags')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !tag) {
    return (
      <main style={{ padding: '2rem' }}>
        <p style={{ color: 'red' }}>⚠️ No tag found with ID: <strong>{id}</strong></p>
      </main>
    );
  }

  const baseUrl =
    typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'http://192.168.0.38:3001' // replace with your local IP
      : 'https://omninethq.vercel.app'; // replace with your Vercel URL

  return (
    <main style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>{tag.title}</h1>
      <p style={{ marginBottom: '2rem' }}>{tag.description}</p>

      {tag.payment_link && (
        <>
          <FaMoneyBillWave color="green" style={{ marginRight: '0.5rem' }} />
          <a href={tag.payment_link} style={{ color: 'blue' }} target="_blank">Pay Now</a>
        </>
      )}

      {tag.contact_method && (
        <p style={{ marginTop: '1rem' }}>
          <FaPhone color="crimson" style={{ marginRight: '0.5rem' }} />
          <strong>Contact:</strong> {tag.contact_method}
        </p>
      )}

      <div style={{ marginTop: '2rem' }}>
        <p style={{ fontWeight: 'bold' }}><FaQrcode style={{ marginRight: '0.5rem' }} />Scan QR to view this tag:</p>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${baseUrl}/tag/${id}`}
          alt="QR Code"
        />
      </div>
    </main>
  );
}
