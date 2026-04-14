/**
 * Axis & Allies 1942 2nd Edition — income / IPC calculation.
 */

import { PowerName } from "./enums.js";
import type { GameTerritoryState } from "./movement.js";

// ---------------------------------------------------------------------------
// Starting IPCs
// ---------------------------------------------------------------------------

/**
 * Each power's starting IPC bank at the beginning of the game (round 1,
 * before any income is collected).  These represent the historical economic
 * values in the 1942 2nd Edition rulebook.
 */
export const STARTING_IPC: Record<PowerName, number> = {
  [PowerName.USSR]: 24,
  [PowerName.GERMANY]: 40,
  [PowerName.UK]: 31,
  [PowerName.JAPAN]: 30,
  [PowerName.USA]: 40,
};

// ---------------------------------------------------------------------------
// Income calculation
// ---------------------------------------------------------------------------

/**
 * Sum the IPC values of the territories listed in `controlledTerritories`.
 *
 * @param controlledTerritories - Array of territory keys controlled by the
 *   power whose income is being calculated.
 * @param territoryIPCValues    - Lookup of territory key → IPC value for the
 *   entire map (typically derived from `ALL_TERRITORIES` in mapData).
 * @returns Total IPC income for the current round.
 */
export function calculateIncome(
  controlledTerritories: string[],
  territoryIPCValues: Record<string, number>,
): number {
  return controlledTerritories.reduce((total, key) => {
    return total + (territoryIPCValues[key] ?? 0);
  }, 0);
}

// ---------------------------------------------------------------------------
// Territory control queries
// ---------------------------------------------------------------------------

/**
 * Return the keys of all territories currently controlled by `power`.
 *
 * @param power  - The power to query.
 * @param states - Full per-territory control state for the game.
 * @returns Array of territory keys controlled by `power`.
 */
export function getControlledTerritories(
  power: PowerName,
  states: GameTerritoryState[],
): string[] {
  return states
    .filter((s) => s.controlledBy === power)
    .map((s) => s.key);
}
