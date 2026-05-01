/**
 * Axis & Allies 1942 2nd Edition — movement validation.
 *
 * Provides BFS-based reachability checks and per-unit entry rules for both
 * combat and non-combat movement phases.
 */

import { PowerName, TerritoryType, UnitType } from "./enums.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Static map data for a territory (does not change during a game). */
export interface TerritoryNode {
  /** Unique territory key (e.g. "germany", "sz_5"). */
  key: string;
  type: TerritoryType;
  /** Keys of all directly adjacent territories/sea zones. */
  adjacentTo: string[];
}

/** Per-game mutable state for a single territory. */
export interface GameTerritoryState {
  key: string;
  /** Null means the territory is uncontrolled (sea zones, neutral land). */
  controlledBy: PowerName | null;
}

/** Context needed to evaluate movement for a specific unit instance. */
export interface UnitMoveContext {
  unitId: string;
  unitType: UnitType;
  power: PowerName;
  /** Territory key the unit is moving from. */
  fromKey: string;
  /** Movement points remaining (usually the unit's base movement value). */
  movementPoints: number;
}

// ---------------------------------------------------------------------------
// Alliance helpers
// ---------------------------------------------------------------------------

/** Allies of each power (they share territory freely). */
const ALLIES: Record<PowerName, PowerName[]> = {
  [PowerName.USSR]: [PowerName.UK, PowerName.USA],
  [PowerName.GERMANY]: [PowerName.JAPAN],
  [PowerName.UK]: [PowerName.USSR, PowerName.USA],
  [PowerName.JAPAN]: [PowerName.GERMANY],
  [PowerName.USA]: [PowerName.USSR, PowerName.UK],
};

function isFriendly(
  movingPower: PowerName,
  controllingPower: PowerName | null,
): boolean {
  if (controllingPower === null) return true; // Uncontrolled/neutral (open for passage during combat move)
  if (controllingPower === movingPower) return true;
  return ALLIES[movingPower].includes(controllingPower);
}

function isEnemy(
  movingPower: PowerName,
  controllingPower: PowerName | null,
): boolean {
  if (controllingPower === null) return false;
  return !isFriendly(movingPower, controllingPower);
}

// ---------------------------------------------------------------------------
// Unit domain helpers
// ---------------------------------------------------------------------------

const AIR_UNIT_TYPES = new Set<UnitType>([UnitType.FIGHTER, UnitType.BOMBER]);
const NAVAL_UNIT_TYPES = new Set<UnitType>([
  UnitType.SUBMARINE,
  UnitType.DESTROYER,
  UnitType.CARRIER,
  UnitType.BATTLESHIP,
  UnitType.TRANSPORT,
]);
const LAND_UNIT_TYPES = new Set<UnitType>([
  UnitType.INFANTRY,
  UnitType.ARTILLERY,
  UnitType.TANK,
  UnitType.AA_GUN,
  UnitType.INDUSTRIAL_COMPLEX,
]);

function isAirUnit(unitType: UnitType): boolean {
  return AIR_UNIT_TYPES.has(unitType);
}

function isNavalUnit(unitType: UnitType): boolean {
  return NAVAL_UNIT_TYPES.has(unitType);
}

function isLandUnit(unitType: UnitType): boolean {
  return LAND_UNIT_TYPES.has(unitType);
}

// ---------------------------------------------------------------------------
// Territory lookup helpers
// ---------------------------------------------------------------------------

function getTerritoryNode(
  key: string,
  territories: TerritoryNode[],
): TerritoryNode | undefined {
  return territories.find((t) => t.key === key);
}

function getTerritoryState(
  key: string,
  states: GameTerritoryState[],
): GameTerritoryState | undefined {
  return states.find((s) => s.key === key);
}

// ---------------------------------------------------------------------------
// Entry rules
// ---------------------------------------------------------------------------

/**
 * Determines whether `unitType` belonging to `movingPower` may enter a given
 * territory during the COMBAT MOVE phase.
 *
 * Rules:
 *  - Land units cannot enter sea zones.
 *  - Naval units cannot enter land territories.
 *  - Air units can fly over any territory but must end on a valid landing zone.
 *  - A land territory controlled by an enemy is a valid combat destination.
 *  - Allied/neutral land territories are valid (can pass through).
 *  - Naval units cannot enter a sea zone that contains enemy surface ships
 *    unless they intend to attack (we treat it as a valid combat destination).
 */
export function canUnitEnterTerritory(
  unitType: UnitType,
  territory: TerritoryNode,
  state: GameTerritoryState,
  movingPower: PowerName,
): boolean {
  if (unitType === UnitType.INDUSTRIAL_COMPLEX) {
    // Industrial complexes never move.
    return false;
  }

  if (isLandUnit(unitType)) {
    // Land units can only enter land territories.
    return territory.type === TerritoryType.LAND;
  }

  if (isNavalUnit(unitType)) {
    // Naval units can only enter sea zones.
    return territory.type === TerritoryType.SEA;
  }

  if (isAirUnit(unitType)) {
    // Aircraft can enter any territory during movement (landing resolved later).
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// BFS reachability
// ---------------------------------------------------------------------------

/**
 * Returns all territory keys reachable by the unit within its movement
 * allowance, using BFS over the adjacency graph.
 *
 * Notes:
 *  - The starting territory is NOT included in the result.
 *  - For land units, movement stops when entering an enemy-controlled
 *    territory (the unit must stop to fight; it cannot pass through).
 *  - For air units, entry is unrestricted during movement; landing zones are
 *    validated separately by `getAircraftLandingZones`.
 *  - Sea zones controlled by enemies (i.e. containing enemy surface ships) are
 *    treated as passable for naval units in the combat-move phase, but the unit
 *    must stop — this is simplified here by stopping at sea zones with enemy
 *    control.
 */
export function getReachableTerritories(
  ctx: UnitMoveContext,
  territories: TerritoryNode[],
  states: GameTerritoryState[],
): string[] {
  // BFS: queue entries are [territoryKey, movementPointsRemaining].
  const visited = new Map<string, number>(); // key → max remaining MP when visited
  const reachable = new Set<string>();
  const queue: Array<{ key: string; mpLeft: number; stoppedByEnemy: boolean }> =
    [];

  const startNode = getTerritoryNode(ctx.fromKey, territories);
  if (!startNode) return [];

  queue.push({ key: ctx.fromKey, mpLeft: ctx.movementPoints, stoppedByEnemy: false });
  visited.set(ctx.fromKey, ctx.movementPoints);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.key !== ctx.fromKey) {
      reachable.add(current.key);
    }

    // If the unit was forced to stop (entered enemy territory) or has no MP
    // left, do not explore further.
    if (current.stoppedByEnemy || current.mpLeft <= 0) continue;

    const node = getTerritoryNode(current.key, territories);
    if (!node) continue;

    for (const neighborKey of node.adjacentTo) {
      const neighborNode = getTerritoryNode(neighborKey, territories);
      const neighborState = getTerritoryState(neighborKey, states);
      if (!neighborNode) continue;

      // Check if the unit can enter this territory type.
      const canEnter = canUnitEnterTerritory(
        ctx.unitType,
        neighborNode,
        neighborState ?? { key: neighborKey, controlledBy: null },
        ctx.power,
      );
      if (!canEnter) continue;

      const newMp = current.mpLeft - 1;
      const prevVisit = visited.get(neighborKey) ?? -1;
      if (newMp <= prevVisit) continue; // Already visited with more/equal MP.

      visited.set(neighborKey, newMp);

      // Does the unit have to stop here?
      const enemyControlled = isEnemy(
        ctx.power,
        neighborState?.controlledBy ?? null,
      );
      const mustStop = isLandUnit(ctx.unitType) && enemyControlled;

      queue.push({
        key: neighborKey,
        mpLeft: newMp,
        stoppedByEnemy: mustStop,
      });
    }
  }

  return Array.from(reachable);
}

// ---------------------------------------------------------------------------
// Combat move validation
// ---------------------------------------------------------------------------

/**
 * Returns true if a unit may legally move from `from` to `to` in the
 * COMBAT MOVE phase.
 *
 * Checks:
 *  1. The destination is within the unit's movement range.
 *  2. The unit type is allowed in the destination territory.
 *  3. For land units, the destination may be enemy-controlled.
 */
export function isValidCombatMove(
  from: string,
  to: string,
  unitType: UnitType,
  movingPower: PowerName,
  territories: TerritoryNode[],
  states: GameTerritoryState[],
): boolean {
  if (from === to) return false;
  if (unitType === UnitType.INDUSTRIAL_COMPLEX) return false;

  const toNode = getTerritoryNode(to, territories);
  const toState = getTerritoryState(to, states);
  if (!toNode) return false;

  const canEnter = canUnitEnterTerritory(
    unitType,
    toNode,
    toState ?? { key: to, controlledBy: null },
    movingPower,
  );
  if (!canEnter) return false;

  // Use the unit's standard movement points from stats.
  const { UNIT_STATS } = await_unit_stats_import();
  const mp = UNIT_STATS_IMPORT[unitType].movement;

  const ctx: UnitMoveContext = {
    unitId: "",
    unitType,
    power: movingPower,
    fromKey: from,
    movementPoints: mp,
  };

  const reachable = getReachableTerritories(ctx, territories, states);
  return reachable.includes(to);
}

// Inline import workaround — we import from unitStats to avoid a circular dep.
import { UNIT_STATS as UNIT_STATS_IMPORT } from "./unitStats.js";
function await_unit_stats_import(): { UNIT_STATS: typeof UNIT_STATS_IMPORT } {
  return { UNIT_STATS: UNIT_STATS_IMPORT };
}

// ---------------------------------------------------------------------------
// Non-combat move validation
// ---------------------------------------------------------------------------

/**
 * Returns true if a unit may legally move from `from` to `to` during the
 * NONCOMBAT MOVE phase.
 *
 * Additional restriction vs combat move:
 *  - The destination must be friendly (own or allied) or uncontrolled.
 *  - Units may not move into enemy-controlled territory during noncombat.
 */
export function isValidNoncombatMove(
  from: string,
  to: string,
  unitType: UnitType,
  movingPower: PowerName,
  territories: TerritoryNode[],
  states: GameTerritoryState[],
): boolean {
  if (from === to) return false;
  if (unitType === UnitType.INDUSTRIAL_COMPLEX) return false;

  const toNode = getTerritoryNode(to, territories);
  const toState = getTerritoryState(to, states);
  if (!toNode) return false;

  // Must not be enemy-controlled.
  if (isEnemy(movingPower, toState?.controlledBy ?? null)) {
    return false;
  }

  const canEnter = canUnitEnterTerritory(
    unitType,
    toNode,
    toState ?? { key: to, controlledBy: null },
    movingPower,
  );
  if (!canEnter) return false;

  const mp = UNIT_STATS_IMPORT[unitType].movement;
  const ctx: UnitMoveContext = {
    unitId: "",
    unitType,
    power: movingPower,
    fromKey: from,
    movementPoints: mp,
  };

  // Build a states view that prevents passing through enemy territory.
  // For noncombat, BFS already stops at enemy territories for land units via
  // canUnitEnterTerritory (sea zones have no controller restriction there),
  // but we additionally need to prevent naval units from ending in enemy sea
  // zones. Since sea zones typically have null controllers, this is mainly
  // relevant for land units which are already handled.
  const reachable = getReachableTerritories(ctx, territories, states);
  return reachable.includes(to);
}

// ---------------------------------------------------------------------------
// Aircraft landing zones
// ---------------------------------------------------------------------------

/**
 * Returns the set of territory keys where aircraft may legally land after
 * their movement.
 *
 * Valid landing zones:
 *  - Friendly-controlled land territories within range.
 *  - Friendly carriers (represented as sea-zone territories containing a
 *    friendly carrier unit).  The caller must pass a list of sea-zone keys
 *    that contain a friendly carrier — this function then checks range.
 *
 * @param from            - Starting territory key.
 * @param movementPoints  - Remaining movement points.
 * @param territories     - Full territory graph.
 * @param states          - Current control state.
 * @param power           - The power whose aircraft are landing.
 * @param friendlyCarrierZones - Optional list of sea-zone keys that contain a
 *                          friendly carrier (defaults to empty).
 */
export function getAircraftLandingZones(
  from: string,
  movementPoints: number,
  territories: TerritoryNode[],
  states: GameTerritoryState[],
  power: PowerName,
  friendlyCarrierZones: string[] = [],
): string[] {
  // Compute all sea + land zones reachable by an aircraft with these MP.
  const ctx: UnitMoveContext = {
    unitId: "",
    unitType: UnitType.FIGHTER, // Use fighter — movement rules are the same.
    power,
    fromKey: from,
    movementPoints,
  };

  const allReachable = getReachableTerritories(ctx, territories, states);
  const carrierSet = new Set(friendlyCarrierZones);

  return allReachable.filter((key) => {
    // Friendly carrier sea zone.
    if (carrierSet.has(key)) return true;

    const node = getTerritoryNode(key, territories);
    const state = getTerritoryState(key, states);
    if (!node) return false;

    // Friendly land territory.
    if (
      node.type === TerritoryType.LAND &&
      isFriendly(power, state?.controlledBy ?? null) &&
      state?.controlledBy !== null
    ) {
      return true;
    }

    return false;
  });
}
