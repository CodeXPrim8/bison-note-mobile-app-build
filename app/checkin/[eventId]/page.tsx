import { redirect } from 'next/navigation'

export default async function CheckinRedirect({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  redirect(`/organizer/events/${eventId}/checkin`)
}
