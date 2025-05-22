'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseclient'; // make sure this path is correct!


export default function Home() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [payment, setPayment] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [tags, setTags] = useState<any[]>([]);

  // Fetch existing tags
  useEffect(() => {
    const fetchTags = async () => {
      const { data, error } = await supabase.from('tags').select('*');
      if (error) {
        console.error('❌ Failed to fetch tags:', error.message);
      } else {
        setTags(data);
      }
    };
    fetchTags();
  }, []);

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data, error } = await supabase.from('tags').insert([
      {
        title,
        description,
        payment_link: payment,
        contact_method: contact,
      },
    ]);

    if (error) {
      console.error('❌ Failed to save tag:', error.message);
      setMessage('Something went wrong. Try again.');
    } else {
      console.log('✅ Tag saved:', data);
      setMessage('✅ OmniTag created successfully!');
      setTitle('');
      setDescription('');
      setPayment('');
      setContact('');

      // Add the new tag to the list
      setTags((prev) => [...prev, ...(data || [])]);
    }
  };

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }}
        />

        <textarea
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }}
        />

        <input
          type="url"
          placeholder="Payment Link"
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
          required
          style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }}
        />

        <input
          type="text"
          placeholder="Contact Method"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
          style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }}
        />

        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Create OmniTag
        </button>
      </form>

      {message && <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>{message}</p>}

      <hr style={{ margin: '2rem 0' }} />

      <h2>📋 Existing OmniTags:</h2>
      {tags.length === 0 ? (
        <p>No tags yet.</p>
      ) : (
        <ul>
          {tags.map((tag) => (
            <li key={tag.id} style={{ marginBottom: '1rem' }}>
              <strong>{tag.title}</strong><br />
              {tag.description}<br />
              <a href={tag.payment_link} target="_blank" rel="noopener noreferrer">💳 Payment Link</a><br />
              📞 Contact: {tag.contact_method}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
