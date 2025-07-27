'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface UserWithStats {
  id: string
  username: string
  avatar_url: string
  referral_count: number
}

export default function LeaderboardPage() {
  const [users, setUsers] = useState<UserWithStats[]>([])

  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, avatar_url, referral_count')
        .order('referral_count', { ascending: false })
        .limit(25)

      if (error) {
        console.error('Failed to load leaderboard:', error)
      } else {
        setUsers(data as UserWithStats[])
      }
    }

    fetchUsers()
  }, [])

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-3xl font-bold text-center mb-6">🏆 Leaderboard</h1>
      <ul className="space-y-4">
        {users.map((user, index) => (
          <li
            key={user.id}
            className="bg-white p-4 rounded shadow flex items-center gap-4"
          >
            <div className="text-xl font-bold w-6 text-right">{index + 1}</div>
            <img
              src={user.avatar_url || '/default-avatar.png'}
              alt="Avatar"
              className="w-10 h-10 rounded-full border"
            />
            <div>
              <Link
                href={`/u/${user.id}`}
                className="text-lg font-medium text-blue-600 hover:underline"
              >
                @{user.username || 'anon'}
              </Link>
              <div className="text-sm text-gray-500">
                {user.referral_count} referral{user.referral_count !== 1 && 's'}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
