import TagClient from './_client'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type ScanPoint = { date: string; count: number }

function ymd(d: Date) {
  // format YYYY-MM-DD in UTC
  const yr = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${yr}-${mo}-${da}`
}

async function getTagScanStats(tagId: string): Promise<ScanPoint[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Fetch last 60 days of scans, then aggregate by UTC day
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 60)

  const { data, error } = await supabase
    .from('scans')
    .select('created_at')
    .eq('tag_id', tagId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })

  if (error || !data) {
    // On any error, return empty data to avoid breaking the page
    return []
  }

  // Aggregate into { 'YYYY-MM-DD': count }
  const map = new Map<string, number>()
  for (const row of data as { created_at: string }[]) {
    const d = new Date(row.created_at)
    const key = ymd(d)
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  // Convert to array sorted by date asc
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, count]) => ({ date, count }))
}

export default async function Page({ params }: { params: { id: string } }) {
  // Preserve your original decoding behavior
  const rawId = params.id
  const decodedId = decodeURIComponent(rawId)

  const scanChartData = await getTagScanStats(decodedId)

  return <TagClient tagId={decodedId} scanChartData={scanChartData} />
}
