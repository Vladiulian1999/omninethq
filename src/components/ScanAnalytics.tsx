'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export default function ScanAnalytics({ data }: { data: { date: string; count: number }[] }) {
  if (!data?.length) return null

  return (
    <div className="mx-auto mt-8 w-full max-w-2xl">
      <h2 className="mb-4 text-xl font-bold text-white">📊 Scans (Last 7 Days)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
          <XAxis dataKey="date" stroke="#94a3b8" />
          <YAxis allowDecimals={false} stroke="#94a3b8" />
          <Tooltip
            contentStyle={{
              background: '#08101b',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              color: '#e2e8f0',
            }}
          />
          <Bar dataKey="count" fill="#22d3ee" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
