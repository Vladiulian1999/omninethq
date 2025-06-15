import { getTagScanStats } from '@/lib/get-scans'
import TagClient from './_client'

export default async function TagPage({ params }: { params: { id: string } }) {
  const decodedId = decodeURIComponent(params.id)
  const scanChartData = await getTagScanStats(decodedId)

  return <TagClient tagId={decodedId} scanChartData={scanChartData} />
}
