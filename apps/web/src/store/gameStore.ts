import { create } from 'zustand'

interface PendingMove {
  unitId: string
  fromTerritory: string
  toTerritory: string
}

interface GameUIState {
  selectedUnitIds: string[]
  pendingMoves: PendingMove[]
  selectedTerritory: string | null
  activeCombatTerritory: string | null

  selectUnit: (unitId: string) => void
  deselectUnit: (unitId: string) => void
  clearSelection: () => void

  addPendingMove: (unitId: string, from: string, to: string) => void
  removePendingMove: (unitId: string) => void
  clearPendingMoves: () => void

  setSelectedTerritory: (key: string | null) => void
  setActiveCombatTerritory: (key: string | null) => void
}

export const useGameStore = create<GameUIState>((set) => ({
  selectedUnitIds: [],
  pendingMoves: [],
  selectedTerritory: null,
  activeCombatTerritory: null,

  selectUnit: (unitId) =>
    set((state) => ({
      selectedUnitIds: state.selectedUnitIds.includes(unitId)
        ? state.selectedUnitIds
        : [...state.selectedUnitIds, unitId],
    })),

  deselectUnit: (unitId) =>
    set((state) => ({
      selectedUnitIds: state.selectedUnitIds.filter((id) => id !== unitId),
    })),

  clearSelection: () => set({ selectedUnitIds: [] }),

  addPendingMove: (unitId, fromTerritory, toTerritory) =>
    set((state) => ({
      pendingMoves: [
        ...state.pendingMoves.filter((m) => m.unitId !== unitId),
        { unitId, fromTerritory, toTerritory },
      ],
    })),

  removePendingMove: (unitId) =>
    set((state) => ({
      pendingMoves: state.pendingMoves.filter((m) => m.unitId !== unitId),
    })),

  clearPendingMoves: () => set({ pendingMoves: [] }),

  setSelectedTerritory: (key) => set({ selectedTerritory: key }),

  setActiveCombatTerritory: (key) => set({ activeCombatTerritory: key }),
}))
