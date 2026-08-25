import { OrganizerEventPicker } from '@/components/web/organizer-event-picker'

export default function OrganizerSalesPage() {
  return (
    <OrganizerEventPicker
      title="Ticket sales"
      body="Open an event to search, filter and export sold tickets."
      hrefSuffix="/tickets"
    />
  )
}
