import clsx from 'clsx'

interface DiceRollProps {
  rolls: number[]
  /** Max value that counts as a hit (inclusive) */
  hitThreshold: number
  label?: string
}

const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const

export default function DiceRoll({ rolls, hitThreshold, label }: DiceRollProps) {
  if (rolls.length === 0) return null

  const hits = rolls.filter((r) => r <= hitThreshold).length

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {rolls.map((roll, i) => {
          const isHit = roll <= hitThreshold
          return (
            <div
              key={i}
              className={clsx(
                'w-9 h-9 flex items-center justify-center rounded-lg border-2 font-bold text-lg',
                'transition-all duration-300 animate-in fade-in zoom-in',
                isHit
                  ? 'bg-green-900/60 border-green-500 text-green-300'
                  : 'bg-red-900/30 border-red-700/60 text-red-400/70',
              )}
              title={`Rolled ${roll} — ${isHit ? 'HIT' : 'Miss'} (threshold ≤${hitThreshold})`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {DIE_FACES[roll] ?? roll}
            </div>
          )
        })}
      </div>
      <p className="text-sm">
        <span className="text-green-400 font-semibold">{hits} hit{hits !== 1 ? 's' : ''}</span>
        <span className="text-gray-500"> / {rolls.length} dice (≤{hitThreshold})</span>
      </p>
    </div>
  )
}
