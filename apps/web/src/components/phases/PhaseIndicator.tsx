import clsx from 'clsx'
import { TurnPhase, PHASE_ORDER } from '@aa/shared'

interface PhaseIndicatorProps {
  currentPhase: TurnPhase
}

const PHASE_SHORT_LABELS: Record<TurnPhase, string> = {
  [TurnPhase.PURCHASE_UNITS]: 'Buy',
  [TurnPhase.COMBAT_MOVE]: 'CM',
  [TurnPhase.CONDUCT_COMBAT]: 'Battle',
  [TurnPhase.NONCOMBAT_MOVE]: 'NCM',
  [TurnPhase.MOBILIZE_UNITS]: 'Place',
  [TurnPhase.COLLECT_INCOME]: 'Collect',
}

export default function PhaseIndicator({ currentPhase }: PhaseIndicatorProps) {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase)

  return (
    <div className="w-full">
      <div className="flex items-center gap-0.5">
        {PHASE_ORDER.map((phase, index) => {
          const isCompleted = index < currentIndex
          const isActive = index === currentIndex

          return (
            <div
              key={phase}
              title={phase.replace(/_/g, ' ')}
              className={clsx(
                'flex-1 text-center py-1 text-xs font-medium rounded transition-colors',
                isCompleted && 'bg-green-800/60 text-green-400',
                isActive && 'bg-usa text-white',
                !isCompleted && !isActive && 'bg-gray-700/50 text-gray-500',
              )}
            >
              {isCompleted ? '✓' : PHASE_SHORT_LABELS[phase]}
            </div>
          )
        })}
      </div>
      <p className="text-center text-xs text-gray-400 mt-1">
        {currentPhase.replace(/_/g, ' ')}
      </p>
    </div>
  )
}
