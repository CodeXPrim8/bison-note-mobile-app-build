import { redirect } from 'next/navigation'

export default async function TicketRedirect({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params
  redirect(`/tickets?id=${ticketId}`)
}
