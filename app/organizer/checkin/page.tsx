import { OrganizerEventPicker } from '@/components/web/organizer-event-picker'

export default function OrganizerCheckinIndex() {
  return (
    <OrganizerEventPicker
      title="Access"
      body="Choose an event, then authenticate each guest at the door."
      hrefSuffix="/checkin"
    />
  )
}
