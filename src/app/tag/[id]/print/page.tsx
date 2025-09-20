import TagClient from './_client'

export const runtime = 'nodejs'

export default function Page({ params }: { params: { id: string } }) {
  return <TagClient tagId={params.id} />
}
