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
    <div className="w-full max-w-2xl mx-auto mt-8">
      <h2 className="text-xl font-bold mb-4">📊 Scans (Last 7 Days)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" fill="#000" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
