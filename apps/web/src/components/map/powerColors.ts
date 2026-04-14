import { PowerName } from '@aa/shared'

export const POWER_FILL_COLORS: Record<string, string> = {
  [PowerName.USSR]:    '#882200',
  [PowerName.GERMANY]: '#4a4a22',
  [PowerName.UK]:      '#8a6622',
  [PowerName.JAPAN]:   '#994400',
  [PowerName.USA]:     '#224466',
  null:                '#444444',
  neutral:             '#555544',
}

export const POWER_STROKE_COLORS: Record<string, string> = {
  [PowerName.USSR]:    '#ff4444',
  [PowerName.GERMANY]: '#aaaa55',
  [PowerName.UK]:      '#ffcc44',
  [PowerName.JAPAN]:   '#ff8833',
  [PowerName.USA]:     '#4488cc',
  null:                '#666666',
  neutral:             '#888877',
}

export function fillForController(controller: string | null): string {
  return POWER_FILL_COLORS[controller ?? 'null'] ?? POWER_FILL_COLORS['null']
}

export function strokeForController(controller: string | null): string {
  return POWER_STROKE_COLORS[controller ?? 'null'] ?? POWER_STROKE_COLORS['null']
}
