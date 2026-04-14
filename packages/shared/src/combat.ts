/**
 * Axis & Allies 1942 2nd Edition — pure combat resolution engine.
 *
 * All functions are deterministic given fixed dice; the server may substitute
 * its own `rollDice` override (e.g. using `crypto.getRandomValues`) without
 * touching any other logic.
 */

import { PowerName, UnitType } from "./enums.js";
import { UNIT_STATS } from "./unitStats.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single unit participating in a battle. */
export interface CombatUnit {
  /** Unique identifier (UUID or similar). */
  id: string;
  type: UnitType;
  power: PowerName;
  /**
   * True for battleships that have absorbed one hit but are not yet sunk.
   * Also used to flag any unit that has been "first-striked" and is pending
   * removal at the end of the sub-phase.
   */
  isDisabled: boolean;
}

/** Snapshot of a battle in progress. */
export interface CombatState {
  /** Units belonging to the attacking side. */
  attackers: CombatUnit[];
  /** Units belonging to the defending side. */
  defenders: CombatUnit[];
  /** Territory key where the battle is taking place. */
  territory: string;
  /** 1-based combat round counter. */
  round: number;
  /** Human-readable narrative of what happened each round. */
  log: string[];
}

/** What happened during a single combat round (for one side or both). */
export interface CombatRoundResult {
  /** Raw dice values rolled by attackers. */
  attackerRolls: number[];
  /** Raw dice values rolled by defenders. */
  defenderRolls: number[];
  /** Number of hits scored by attackers this round. */
  attackerHits: number;
  /** Number of hits scored by defenders this round. */
  defenderHits: number;
  /** Units removed from the attacker side this round. */
  attackerCasualties: CombatUnit[];
  /** Units removed from the defender side this round. */
  defenderCasualties: CombatUnit[];
  /** Narrative entries appended this round. */
  log: string[];
  /** Updated attacker array (casualties removed). */
  updatedAttackers: CombatUnit[];
  /** Updated defender array (casualties removed). */
  updatedDefenders: CombatUnit[];
}

/** Final outcome of a completed battle. */
export interface CombatResult {
  /**
   * The power that controls the territory after the battle.
   * `null` means the battle ended with no units on either side (unlikely but
   * possible — territory remains with the original controller).
   */
  winner: PowerName | null;
  /** Total rounds fought. */
  rounds: number;
  /** Whether the attacker successfully captured the territory. */
  captured: boolean;
  /** Full round-by-round narrative. */
  log: string[];
}

// ---------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------

/**
 * Roll `count` six-sided dice.
 * The server should shadow this with a crypto-backed implementation for
 * production use; this version is suitable for tests and offline play.
 */
export function rollDice(count: number): number[] {
  if (count < 0) {
    throw new RangeError(`rollDice: count must be >= 0, got ${count}`);
  }
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * 6) + 1);
  }
  return results;
}

/**
 * Count how many values in `rolls` are less than or equal to `threshold`.
 * A threshold of 0 means the unit never hits (e.g. AA Guns have attack 0).
 */
export function countHits(rolls: number[], threshold: number): number {
  if (threshold <= 0) return 0;
  return rolls.filter((r) => r <= threshold).length;
}

// ---------------------------------------------------------------------------
// Artillery boost
// ---------------------------------------------------------------------------

/**
 * Pair each artillery with one infantry and return a map of unit-id → effective
 * attack value.  Unpaired infantry keep their base attack of 1; paired infantry
 * attack at 2.  All other unit types retain their standard attack values.
 *
 * Pairing is one-to-one: one artillery boosts exactly one infantry.
 */
export function applyArtilleryBoost(units: CombatUnit[]): Map<string, number> {
  const attackMap = new Map<string, number>();

  // Separate infantry and artillery by id.
  const infantryIds: string[] = [];
  const artilleryIds: string[] = [];

  for (const unit of units) {
    if (unit.type === UnitType.INFANTRY) {
      infantryIds.push(unit.id);
    } else if (unit.type === UnitType.ARTILLERY) {
      artilleryIds.push(unit.id);
    }
  }

  // Determine how many infantry get boosted.
  const boostedCount = Math.min(infantryIds.length, artilleryIds.length);
  const boostedInfantryIds = new Set(infantryIds.slice(0, boostedCount));

  // Populate the map for every unit.
  for (const unit of units) {
    const baseAttack = UNIT_STATS[unit.type].attack;
    if (unit.type === UnitType.INFANTRY && boostedInfantryIds.has(unit.id)) {
      // Boosted infantry attack at 2.
      attackMap.set(unit.id, 2);
    } else {
      attackMap.set(unit.id, baseAttack);
    }
  }

  return attackMap;
}

// ---------------------------------------------------------------------------
// AA Gun fire (pre-combat, defender-side)
// ---------------------------------------------------------------------------

/**
 * Resolve AA-gun fire against incoming aircraft.
 *
 * Rules:
 *  - Each aircraft is shot at once on a roll of 1 (hits on 1).
 *  - AA fire only occurs if the defending territory has at least one AA Gun.
 *  - AA Guns do not participate in regular combat and are never lost in this
 *    step.
 */
export function resolveAAFire(
  attackingAircraft: CombatUnit[],
  hasAAGun: boolean,
): { hits: number; rolls: number[] } {
  if (!hasAAGun || attackingAircraft.length === 0) {
    return { hits: 0, rolls: [] };
  }

  const rolls = rollDice(attackingAircraft.length);
  // AA fire hits on a roll of exactly 1.
  const hits = countHits(rolls, 1);
  return { hits, rolls };
}

// ---------------------------------------------------------------------------
// Submarine first-strike
// ---------------------------------------------------------------------------

/**
 * Resolve the submarine first-strike sub-phase.
 *
 * Rules:
 *  - Submarines fire before regular combat at their normal values
 *    (attack 2, defense 1).
 *  - If the enemy side has at least one destroyer, the sub's first-strike
 *    ability is cancelled and this function returns zero hits for that side.
 *  - Hits from first strike are applied immediately; those casualties do NOT
 *    fire back during the general combat phase.
 */
export function resolveSubFirstStrike(
  attackingSubs: CombatUnit[],
  defendingSubs: CombatUnit[],
  hasEnemyDestroyer: boolean,
): {
  attackerHits: number;
  defenderHits: number;
  attackerRolls: number[];
  defenderRolls: number[];
} {
  // Attacker subs: first-strike is cancelled if defenders have a destroyer.
  let attackerRolls: number[] = [];
  let attackerHits = 0;
  if (attackingSubs.length > 0 && !hasEnemyDestroyer) {
    attackerRolls = rollDice(attackingSubs.length);
    attackerHits = countHits(attackerRolls, UNIT_STATS[UnitType.SUBMARINE].attack);
  }

  // Defender subs: first-strike is cancelled if attackers have a destroyer.
  // NOTE: "hasEnemyDestroyer" is from the perspective of the sub owner, so
  // for defending subs the caller passes whether ATTACKERS have a destroyer.
  // We reuse the same flag — the caller should call this function twice or
  // pass the correct flag for each side.  Here we use a single flag that the
  // caller interprets as "does the opposing force have a destroyer?".
  let defenderRolls: number[] = [];
  let defenderHits = 0;
  if (defendingSubs.length > 0 && !hasEnemyDestroyer) {
    defenderRolls = rollDice(defendingSubs.length);
    defenderHits = countHits(
      defenderRolls,
      UNIT_STATS[UnitType.SUBMARINE].defense,
    );
  }

  return { attackerHits, defenderHits, attackerRolls, defenderRolls };
}

// ---------------------------------------------------------------------------
// General combat
// ---------------------------------------------------------------------------

/**
 * Resolve one round of general combat (after subs and AA fire have been
 * handled).
 *
 * @param attackers       - Active attacking units (subs whose first strike was
 *                          cancelled are included here).
 * @param defenders       - Active defending units.
 * @param boostedAttackMap - Map of unit-id → effective attack value produced by
 *                          `applyArtilleryBoost`.
 */
export function resolveGeneralCombat(
  attackers: CombatUnit[],
  defenders: CombatUnit[],
  boostedAttackMap: Map<string, number>,
): {
  attackerHits: number;
  defenderHits: number;
  attackerRolls: number[];
  defenderRolls: number[];
} {
  // Attacker rolls — use boosted map where available.
  const attackerRolls: number[] = [];
  let attackerHits = 0;
  for (const unit of attackers) {
    const threshold =
      boostedAttackMap.get(unit.id) ?? UNIT_STATS[unit.type].attack;
    if (threshold <= 0) continue; // Unit cannot attack (e.g. transport).
    const [roll] = rollDice(1);
    attackerRolls.push(roll);
    if (roll <= threshold) attackerHits++;
  }

  // Defender rolls — always use base defense values.
  const defenderRolls: number[] = [];
  let defenderHits = 0;
  for (const unit of defenders) {
    const threshold = UNIT_STATS[unit.type].defense;
    if (threshold <= 0) continue;
    const [roll] = rollDice(1);
    defenderRolls.push(roll);
    if (roll <= threshold) defenderHits++;
  }

  return { attackerHits, defenderHits, attackerRolls, defenderRolls };
}

// ---------------------------------------------------------------------------
// Casualty selection (internal helper)
// ---------------------------------------------------------------------------

/**
 * Remove `hits` casualties from `units`, preferring the cheapest units and
 * handling battleship two-hit rule.
 *
 * Battleships absorb the first hit (isDisabled → true) before being removed.
 * Returns { survivors, casualties }.
 */
function applyCasualties(
  units: CombatUnit[],
  hits: number,
): { survivors: CombatUnit[]; casualties: CombatUnit[] } {
  if (hits <= 0) {
    return { survivors: [...units], casualties: [] };
  }

  // Sort by cost ascending so cheapest units absorb hits first.
  const sorted = [...units].sort(
    (a, b) => UNIT_STATS[a.type].cost - UNIT_STATS[b.type].cost,
  );

  const survivors: CombatUnit[] = [];
  const casualties: CombatUnit[] = [];
  let remainingHits = hits;

  for (const unit of sorted) {
    if (remainingHits <= 0) {
      survivors.push(unit);
      continue;
    }

    const isBattleship =
      UNIT_STATS[unit.type].specialRules.includes("two_hit");

    if (isBattleship && !unit.isDisabled) {
      // First hit: disable the battleship but keep it alive.
      survivors.push({ ...unit, isDisabled: true });
      remainingHits--;
    } else {
      // Normal unit or already-disabled battleship: remove it.
      casualties.push(unit);
      remainingHits--;
    }
  }

  return { survivors, casualties };
}

// ---------------------------------------------------------------------------
// Full round resolution
// ---------------------------------------------------------------------------

/**
 * Execute a complete combat round and return the updated state + round result.
 *
 * Sequence per round:
 *  1. AA fire (only on round 1 if defenders have AA guns).
 *  2. Sub first-strike phase.
 *  3. General combat (all remaining units).
 *  4. Casualties applied simultaneously.
 */
export function resolveCombatRound(state: CombatState): CombatRoundResult {
  const log: string[] = [];
  let workingAttackers = state.attackers.filter((u) => !u.isDisabled || UNIT_STATS[u.type].specialRules.includes("two_hit"));
  // Re-include disabled battleships (they can still fight while damaged).
  workingAttackers = state.attackers;
  const workingDefenders = state.defenders;

  let attackerHitsTotal = 0;
  let defenderHitsTotal = 0;
  const allAttackerRolls: number[] = [];
  const allDefenderRolls: number[] = [];

  // ── Step 1: AA fire (round 1 only) ────────────────────────────────────────
  if (state.round === 1) {
    const hasAAGun = workingDefenders.some(
      (u) => u.type === UnitType.AA_GUN,
    );
    const aircraft = workingAttackers.filter(
      (u) =>
        u.type === UnitType.FIGHTER || u.type === UnitType.BOMBER,
    );
    const aaResult = resolveAAFire(aircraft, hasAAGun);
    if (aaResult.rolls.length > 0) {
      log.push(
        `AA fire: rolled [${aaResult.rolls.join(", ")}] → ${aaResult.hits} hit(s) on attacking aircraft.`,
      );
      // AA hits come off attackers (aircraft only).
      // We count them toward defender "hits against attackers".
      defenderHitsTotal += aaResult.hits;
      allDefenderRolls.push(...aaResult.rolls);
    }
  }

  // ── Step 2: Sub first-strike ───────────────────────────────────────────────
  const attackingSubs = workingAttackers.filter(
    (u) => u.type === UnitType.SUBMARINE,
  );
  const defendingSubs = workingDefenders.filter(
    (u) => u.type === UnitType.SUBMARINE,
  );
  const defenderHasDestroyer = workingDefenders.some(
    (u) => u.type === UnitType.DESTROYER,
  );
  const attackerHasDestroyer = workingAttackers.some(
    (u) => u.type === UnitType.DESTROYER,
  );

  if (attackingSubs.length > 0 || defendingSubs.length > 0) {
    // For attacking subs: cancelled if defenders have a destroyer.
    // For defending subs: cancelled if attackers have a destroyer.
    // We model this with two separate calls.

    let subAttackerHits = 0;
    let subDefenderHits = 0;
    const subAttackerRolls: number[] = [];
    const subDefenderRolls: number[] = [];

    if (attackingSubs.length > 0 && !defenderHasDestroyer) {
      const rolls = rollDice(attackingSubs.length);
      const hits = countHits(rolls, UNIT_STATS[UnitType.SUBMARINE].attack);
      subAttackerHits += hits;
      subAttackerRolls.push(...rolls);
      log.push(
        `Attacker sub first-strike: rolled [${rolls.join(", ")}] → ${hits} hit(s).`,
      );
    }

    if (defendingSubs.length > 0 && !attackerHasDestroyer) {
      const rolls = rollDice(defendingSubs.length);
      const hits = countHits(rolls, UNIT_STATS[UnitType.SUBMARINE].defense);
      subDefenderHits += hits;
      subDefenderRolls.push(...rolls);
      log.push(
        `Defender sub first-strike: rolled [${rolls.join(", ")}] → ${hits} hit(s).`,
      );
    }

    attackerHitsTotal += subAttackerHits;
    defenderHitsTotal += subDefenderHits;
    allAttackerRolls.push(...subAttackerRolls);
    allDefenderRolls.push(...subDefenderRolls);
  }

  // ── Step 3: General combat ────────────────────────────────────────────────
  const boostMap = applyArtilleryBoost(workingAttackers);
  const generalResult = resolveGeneralCombat(
    workingAttackers,
    workingDefenders,
    boostMap,
  );
  attackerHitsTotal += generalResult.attackerHits;
  defenderHitsTotal += generalResult.defenderHits;
  allAttackerRolls.push(...generalResult.attackerRolls);
  allDefenderRolls.push(...generalResult.defenderRolls);

  log.push(
    `General combat: attackers rolled [${generalResult.attackerRolls.join(", ")}] → ${generalResult.attackerHits} hit(s); ` +
      `defenders rolled [${generalResult.defenderRolls.join(", ")}] → ${generalResult.defenderHits} hit(s).`,
  );

  // ── Step 4: Apply casualties simultaneously ────────────────────────────────
  const { survivors: updatedAttackers, casualties: attackerCasualties } =
    applyCasualties(workingAttackers, defenderHitsTotal);

  const { survivors: updatedDefenders, casualties: defenderCasualties } =
    applyCasualties(workingDefenders, attackerHitsTotal);

  if (attackerCasualties.length > 0) {
    log.push(
      `Attacker casualties: ${attackerCasualties.map((u) => u.type).join(", ")}.`,
    );
  }
  if (defenderCasualties.length > 0) {
    log.push(
      `Defender casualties: ${defenderCasualties.map((u) => u.type).join(", ")}.`,
    );
  }

  return {
    attackerRolls: allAttackerRolls,
    defenderRolls: allDefenderRolls,
    attackerHits: attackerHitsTotal,
    defenderHits: defenderHitsTotal,
    attackerCasualties,
    defenderCasualties,
    log,
    updatedAttackers,
    updatedDefenders,
  };
}

// ---------------------------------------------------------------------------
// Combat termination conditions
// ---------------------------------------------------------------------------

/**
 * Returns true when the combat should end because:
 *  - All attackers have been eliminated, OR
 *  - All defenders have been eliminated, OR
 *  - The attacker has chosen to retreat (not modelled here — caller sets
 *    attackers to [] to force this path).
 *
 * Disabled (damaged-but-alive) battleships still count as present.
 */
export function isCombatOver(state: CombatState): boolean {
  const livingAttackers = state.attackers.filter(
    (u) => !isUnitDestroyed(u),
  );
  const livingDefenders = state.defenders.filter(
    (u) => !isUnitDestroyed(u),
  );

  return livingAttackers.length === 0 || livingDefenders.length === 0;
}

/**
 * A unit is "destroyed" (fully eliminated) only when it is marked disabled AND
 * it is a two-hit unit (battleship), or simply when it appears in the
 * casualties list.  In the combat state we keep track by removing casualties
 * from the arrays, so a unit present in the array is always alive.
 * This helper is used internally for the edge case of disabled battleships
 * that are still in the state array.
 */
function isUnitDestroyed(unit: CombatUnit): boolean {
  // Disabled non-battleships are already in the casualty list (removed from
  // the state arrays) so this only matters for battleships.
  const isBattleship =
    UNIT_STATS[unit.type].specialRules.includes("two_hit");
  // A disabled battleship is damaged but alive — NOT destroyed.
  if (isBattleship && unit.isDisabled) return false;
  // AA guns and industrial complexes do not participate in combat casualty
  // selection but are never "destroyed" by hits.
  return false;
}

/**
 * Returns true if the attacking side has won the combat AND has at least one
 * land unit capable of occupying the territory.
 *
 * Aircraft alone cannot capture a land territory.
 */
export function canAttackerCapture(state: CombatState): boolean {
  if (!isCombatOver(state)) return false;

  // Attackers must still have living units.
  if (state.attackers.length === 0) return false;

  // Check for at least one land unit among surviving attackers.
  const landUnitTypes = new Set<UnitType>([
    UnitType.INFANTRY,
    UnitType.ARTILLERY,
    UnitType.TANK,
    UnitType.AA_GUN,
  ]);

  return state.attackers.some((u) => landUnitTypes.has(u.type));
}
