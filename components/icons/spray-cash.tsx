import { forwardRef, type SVGProps } from 'react'
import type { LucideIcon } from 'lucide-react'

type IconProps = SVGProps<SVGSVGElement> & {
  size?: string | number
  absoluteStrokeWidth?: boolean
}

/**
 * Spray + gift: open hand spraying a lapped cash-voucher bundle.
 * Wide banknote shapes (not tickets) + giving hand = tips / spray / gift.
 */
export const SprayCash = forwardRef<SVGSVGElement, IconProps>(
  (
    {
      color = 'currentColor',
      size = 24,
      strokeWidth = 2,
      absoluteStrokeWidth,
      className,
      ...rest
    },
    ref,
  ) => {
    const sw =
      absoluteStrokeWidth && typeof size === 'number'
        ? (Number(strokeWidth) * 24) / size
        : strokeWidth

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...rest}
      >
        {/* Wide cash vouchers, lapped like a sprayed wad */}
        <g>
          {/* back / left bill */}
          <rect x="1.5" y="5.5" width="11" height="6.2" rx="1.15" transform="rotate(-28 7 8.6)" />
          {/* middle bill */}
          <rect x="6.2" y="2.4" width="11.4" height="6.2" rx="1.15" transform="rotate(4 11.9 5.5)" />
          {/* front / right bill */}
          <rect x="11.2" y="4.2" width="11" height="6.2" rx="1.15" transform="rotate(30 16.7 7.3)" />
        </g>

        {/* Open hand — spraying / gifting upward */}
        <path d="M11 15.8h2a2 2 0 1 0 0-4h-3c-.55 0-1.05.22-1.4.62L3.2 17.6" />
        <path d="m7.2 21.6 1.55-1.35c.3-.35.78-.55 1.3-.55h4c1.05 0 2-.35 2.7-1.15l4.2-4a1.95 1.95 0 0 0-2.65-2.85l-3.8 3.55" />
        <path d="m2.2 16.6 6 6" />
      </svg>
    )
  },
) as unknown as LucideIcon

SprayCash.displayName = 'SprayCash'
