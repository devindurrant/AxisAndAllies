import clsx from 'clsx'
import { PowerName } from '@aa/shared'

interface PowerBadgeProps {
  power: PowerName
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const POWER_STYLES: Record<PowerName, string> = {
  [PowerName.USSR]: 'bg-ussr/20 text-red-300 border-ussr/50',
  [PowerName.GERMANY]: 'bg-germany/20 text-yellow-200 border-germany/50',
  [PowerName.UK]: 'bg-uk/20 text-yellow-300 border-uk/50',
  [PowerName.JAPAN]: 'bg-japan/20 text-orange-300 border-japan/50',
  [PowerName.USA]: 'bg-usa/20 text-blue-300 border-usa/50',
}

const POWER_LABELS: Record<PowerName, string> = {
  [PowerName.USSR]: 'USSR',
  [PowerName.GERMANY]: 'Germany',
  [PowerName.UK]: 'UK',
  [PowerName.JAPAN]: 'Japan',
  [PowerName.USA]: 'USA',
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-3 py-1.5',
}

export default function PowerBadge({ power, size = 'md', className }: PowerBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-semibold rounded border',
        POWER_STYLES[power],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {POWER_LABELS[power]}
    </span>
  )
}
