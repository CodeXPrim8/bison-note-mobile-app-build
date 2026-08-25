import { redirect } from 'next/navigation'

export default async function LegacyEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/events/${slug}`)
}
