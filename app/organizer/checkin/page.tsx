import { OrganizerEventPicker } from '@/components/web/organizer-event-picker'

export default function OrganizerCheckinIndex() {
  return (
    <OrganizerEventPicker
      title="Check-in"
      body="Choose an event, then scan QR codes or enter backup check-in codes."
      hrefSuffix="/checkin"
    />
  )
}
