/**
 * Axis & Allies 1942 2nd Edition — turn/phase state machine.
 *
 * Turn order: USSR → Germany → UK → Japan → USA (then repeat).
 * Each power completes all six phases before the next power moves.
 */

import { PowerName, TurnPhase } from "./enums.js";

/** Canonical turn order as defined by the rulebook. */
export const TURN_ORDER: readonly PowerName[] = [
  PowerName.USSR,
  PowerName.GERMANY,
  PowerName.UK,
  PowerName.JAPAN,
  PowerName.USA,
] as const;

/** Canonical phase order within a single power's turn. */
export const PHASE_ORDER: readonly TurnPhase[] = [
  TurnPhase.PURCHASE_UNITS,
  TurnPhase.COMBAT_MOVE,
  TurnPhase.CONDUCT_COMBAT,
  TurnPhase.NONCOMBAT_MOVE,
  TurnPhase.MOBILIZE_UNITS,
  TurnPhase.COLLECT_INCOME,
] as const;

/**
 * Returns the phase that follows `currentPhase` within a turn.
 * Returns `null` when `currentPhase` is the last phase (COLLECT_INCOME),
 * signalling that the current power's turn is finished.
 */
export function getNextPhase(currentPhase: TurnPhase): TurnPhase | null {
  const idx = PHASE_ORDER.indexOf(currentPhase);
  if (idx === -1) {
    throw new Error(`Unknown phase: ${currentPhase}`);
  }
  const nextIdx = idx + 1;
  if (nextIdx >= PHASE_ORDER.length) {
    return null;
  }
  return PHASE_ORDER[nextIdx];
}

/**
 * Returns the power whose turn comes after `currentPower`, cycling back to
 * USSR after USA.
 */
export function getNextPower(currentPower: PowerName): PowerName {
  const idx = TURN_ORDER.indexOf(currentPower);
  if (idx === -1) {
    throw new Error(`Unknown power: ${currentPower}`);
  }
  return TURN_ORDER[(idx + 1) % TURN_ORDER.length];
}

export interface AdvanceTurnResult {
  /** The power whose turn is now active. */
  power: PowerName;
  /** The phase that power is now in. */
  phase: TurnPhase;
  /**
   * True when the advance wrapped from USA's COLLECT_INCOME back to USSR's
   * PURCHASE_UNITS, incrementing the game round counter.
   */
  newRound: boolean;
}

/**
 * Given the current power and phase, returns the next active power/phase pair.
 *
 * Sequencing logic:
 *  1. If there is a next phase in this turn, stay on the same power and advance
 *     the phase.
 *  2. Otherwise advance to the next power and reset to PURCHASE_UNITS.
 *  3. `newRound` is set to true only when the advance crosses from USA back to
 *     USSR (i.e. a full round of play has just completed).
 */
export function advanceTurn(
  currentPower: PowerName,
  currentPhase: TurnPhase,
): AdvanceTurnResult {
  const nextPhase = getNextPhase(currentPhase);

  if (nextPhase !== null) {
    // Still in the same power's turn.
    return { power: currentPower, phase: nextPhase, newRound: false };
  }

  // Current power's turn is over — move to the next power.
  const nextPower = getNextPower(currentPower);
  const newRound =
    currentPower === PowerName.USA &&
    currentPhase === TurnPhase.COLLECT_INCOME;

  return {
    power: nextPower,
    phase: TurnPhase.PURCHASE_UNITS,
    newRound,
  };
}
