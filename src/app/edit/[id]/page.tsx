import EditClient from './_client'

export default function EditPage({ params }: { params: { id: string } }) {
  const decodedId = decodeURIComponent(params.id)
  return <EditClient id={decodedId} />
}
