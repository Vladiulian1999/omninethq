'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { BackButton } from '@/components/BackButton'

type User = {
  id: string
  username?: string
  bio?: string
  avatar_url?: string
}

export default function UserDirectoryPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, bio, avatar_url')
        .order('username', { ascending: true })

      if (data) {
        setUsers(data)
      }
      setLoading(false)
    }

    fetchUsers()
  }, [])

  return (
    <div className="max-w-3xl mx-auto p-6">
      <BackButton />

      <h1 className="text-3xl font-bold mb-6 text-center">🧑‍🤝‍🧑 Discover OmniNet Users</h1>

      {loading ? (
        <p className="text-center text-gray-500">Loading users...</p>
      ) : users.length === 0 ? (
        <p className="text-center text-gray-500">No users found.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {users.map((user) => (
            <li
              key={user.id}
              className="border p-4 rounded shadow-sm hover:shadow-md transition bg-white"
            >
              <Link href={`/u/${user.id}`}>
                <div className="flex items-center gap-4">
                  {user.avatar_url ? (
                    <Image
                      src={user.avatar_url}
                      alt="avatar"
                      width={50}
                      height={50}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-[50px] h-[50px] rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xl">
                      ?
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-sm">{user.username || 'Unnamed'}</p>
                    {user.bio && (
                      <p className="text-xs text-gray-600 line-clamp-2">{user.bio}</p>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
