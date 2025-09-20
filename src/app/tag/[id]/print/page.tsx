import TagClient from './_client'

export const runtime = 'nodejs'

export default function Page({ params }: { params: { id: string } }) {
  // Pass the tagId down to client; it will fetch details and render
  return <TagClient tagId={params.id} />
}
