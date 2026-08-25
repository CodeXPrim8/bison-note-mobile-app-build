import { OrganizerEventPicker } from '@/components/web/organizer-event-picker'

export default function OrganizerGuestsPage() {
  return (
    <OrganizerEventPicker
      title="Guests"
      body="Invite guests to private events using their ɃU ID (registered phone number)."
      hrefSuffix="/guests"
    />
  )
}
