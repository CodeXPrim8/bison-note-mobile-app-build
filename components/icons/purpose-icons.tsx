import type { ReactNode, SVGProps } from 'react'
import type { PurposeId } from '@/lib/purpose'

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string }

function Base({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  )
}

export function FuelIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 20V6.5A2.5 2.5 0 0 1 8.5 4h4A2.5 2.5 0 0 1 15 6.5V20" />
      <path d="M6 20h9" />
      <path d="M8 8h5" />
      <path d="M15 9h2.2a1.8 1.8 0 0 1 1.8 1.8V14a2 2 0 0 0 2 2H21" />
      <path d="M18 7.5 20 5.5" />
    </Base>
  )
}

export function GroceriesIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 9h14l-1.2 10.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 9Z" />
      <path d="M8.5 9V7.2A3.5 3.5 0 0 1 12 3.7 3.5 3.5 0 0 1 15.5 7.2V9" />
      <path d="M9.5 13.5h.01M12 13.5h.01M14.5 13.5h.01" />
    </Base>
  )
}

export function FoodIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 11.5h14a6.2 6.2 0 0 1-6.2 6.2h-1.6A6.2 6.2 0 0 1 5 11.5Z" />
      <path d="M8 11.5c.2-2.2 1.2-4 2.2-5.2" />
      <path d="M12 11.2V6.2" />
      <path d="M15.5 11.5c-.1-2 1-4 2-5.4" />
      <path d="M8 20h8" />
    </Base>
  )
}

export function TransportIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="6" width="14" height="9" rx="2" />
      <path d="M17.5 9H20a1.5 1.5 0 0 1 1.5 1.5V15H17.5" />
      <path d="M3.5 15H21" />
      <circle cx="7.5" cy="17.5" r="1.4" />
      <circle cx="16.5" cy="17.5" r="1.4" />
      <path d="M7 9.2h6" />
    </Base>
  )
}

export function PharmacyIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </Base>
  )
}

export function HotelIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 18V10.5A2.5 2.5 0 0 1 6.5 8H11v10" />
      <path d="M11 18V7.5A2.5 2.5 0 0 1 13.5 5H18a2 2 0 0 1 2 2V18" />
      <path d="M3 18h18" />
      <path d="M14.5 10.5h2.2M14.5 13.5h2.2" />
    </Base>
  )
}

const ICONS = {
  fuel: FuelIcon,
  groceries: GroceriesIcon,
  food: FoodIcon,
  transport: TransportIcon,
  pharmacy: PharmacyIcon,
  hotel: HotelIcon,
} as const

export function PurposeIcon({
  purpose,
  ...props
}: IconProps & { purpose: PurposeId }) {
  const Icon = ICONS[purpose]
  return <Icon {...props} />
}
