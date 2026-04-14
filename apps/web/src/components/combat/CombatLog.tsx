import { useEffect, useRef } from 'react'

interface CombatLogProps {
  entries: string[]
}

export default function CombatLog({ entries }: CombatLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  if (entries.length === 0) {
    return (
      <div className="text-xs text-gray-500 italic text-center py-4">
        No combat events yet.
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-black/30 border border-gray-700 p-3 max-h-40 overflow-y-auto text-xs font-mono space-y-1">
      {entries.map((entry, i) => {
        const isRound = entry.startsWith('Round') || entry.includes('rolled')
        const isCasualty = entry.toLowerCase().includes('casualt')
        const isAA = entry.toLowerCase().includes('aa fire')

        return (
          <p
            key={i}
            className={
              isRound
                ? 'text-gray-300'
                : isCasualty
                ? 'text-red-400'
                : isAA
                ? 'text-yellow-400'
                : 'text-gray-400'
            }
          >
            {entry}
          </p>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
