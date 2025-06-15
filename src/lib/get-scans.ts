// lib/get-scans.ts
import { supabaseServer } from './supabaseServerClient'

export async function getTagScanStats(tagId: string) {
  const { data, error } = await supabaseServer
    .from('scans')
    .select('created_at')
    .eq('tag_id', tagId)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  if (error) {
    console.error('Failed to fetch scans:', error)
    return []
  }

  const counts: { [key: string]: number } = {}

  for (let i = 0; i < 7; i++) {
    const day = new Date()
    day.setDate(day.getDate() - i)
    const key = day.toISOString().slice(0, 10)
    counts[key] = 0
  }

  data.forEach((row: { created_at: string }) => {
    const date = new Date(row.created_at).toISOString().slice(0, 10)
    if (counts[date] !== undefined) {
      counts[date]++
    }
  })

  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))
}
