import { describe, it, expect } from 'vitest';
import {
  countHits,
  resolveAAFire,
  resolveSubFirstStrike,
  applyArtilleryBoost,
  resolveCombatRound,
  isCombatOver,
  canAttackerCapture,
} from '../combat.js';
import { PowerName, UnitType } from '../enums.js';
import type { CombatUnit, CombatState } from '../combat.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function makeUnit(
  type: UnitType,
  power: PowerName = PowerName.GERMANY,
  isDisabled = false,
): CombatUnit {
  return { id: `unit-${++idCounter}`, type, power, isDisabled };
}

function makeState(
  attackers: CombatUnit[],
  defenders: CombatUnit[],
  round = 1,
): CombatState {
  return { attackers, defenders, territory: 'test_territory', round, log: [] };
}

// ---------------------------------------------------------------------------
// countHits
// ---------------------------------------------------------------------------

describe('countHits', () => {
  it('counts rolls at or below threshold as hits', () => {
    expect(countHits([1, 2, 3, 4, 5, 6], 3)).toBe(3);
  });

  it('returns 0 when threshold is 0', () => {
    expect(countHits([1, 2, 3], 0)).toBe(0);
  });

  it('returns 0 for an empty rolls array', () => {
    expect(countHits([], 4)).toBe(0);
  });

  it('counts all rolls when threshold is 6', () => {
    expect(countHits([1, 2, 3, 4, 5, 6], 6)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// resolveAAFire
// ---------------------------------------------------------------------------

describe('resolveAAFire', () => {
  it('returns no rolls when hasAAGun is false', () => {
    const fighter = makeUnit(UnitType.FIGHTER);
    const result = resolveAAFire([fighter], false);
    expect(result.rolls).toHaveLength(0);
    expect(result.hits).toBe(0);
  });

  it('returns no rolls when there are no attacking aircraft', () => {
    const result = resolveAAFire([], true);
    expect(result.rolls).toHaveLength(0);
  });

  it('fires one die per aircraft when AA gun is present', () => {
    const aircraft = [
      makeUnit(UnitType.FIGHTER),
      makeUnit(UnitType.BOMBER),
      makeUnit(UnitType.FIGHTER),
    ];
    const result = resolveAAFire(aircraft, true);
    expect(result.rolls).toHaveLength(3);
  });

  it('only rolls of 1 are hits', () => {
    // Force all rolls to be 1 → all hit
    expect(countHits([1, 1, 1], 1)).toBe(3);
    // Rolls of 2+ are misses
    expect(countHits([2, 3, 4, 5, 6], 1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveSubFirstStrike
// ---------------------------------------------------------------------------

describe('resolveSubFirstStrike', () => {
  it('attacking subs score hits when defenders have no destroyer', () => {
    const subs = [makeUnit(UnitType.SUBMARINE, PowerName.GERMANY)];
    const result = resolveSubFirstStrike(subs, [], false);
    // 1 die rolled for 1 sub
    expect(result.attackerRolls).toHaveLength(1);
    // Defender has no subs so no defender rolls
    expect(result.defenderRolls).toHaveLength(0);
  });

  it('attacking subs are cancelled when defenders have a destroyer', () => {
    const subs = [makeUnit(UnitType.SUBMARINE, PowerName.GERMANY)];
    const result = resolveSubFirstStrike(subs, [], true);
    // hasEnemyDestroyer = true → subs cannot fire
    expect(result.attackerRolls).toHaveLength(0);
    expect(result.attackerHits).toBe(0);
  });

  it('defending subs are cancelled when hasEnemyDestroyer is true', () => {
    const defendingSubs = [makeUnit(UnitType.SUBMARINE, PowerName.USSR)];
    const result = resolveSubFirstStrike([], defendingSubs, true);
    expect(result.defenderRolls).toHaveLength(0);
    expect(result.defenderHits).toBe(0);
  });

  it('defending subs fire when enemy (attackers) have no destroyer', () => {
    const defendingSubs = [makeUnit(UnitType.SUBMARINE, PowerName.USSR)];
    const result = resolveSubFirstStrike([], defendingSubs, false);
    expect(result.defenderRolls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// applyArtilleryBoost
// ---------------------------------------------------------------------------

describe('applyArtilleryBoost', () => {
  it('boosts one infantry per artillery', () => {
    const inf1 = makeUnit(UnitType.INFANTRY);
    const inf2 = makeUnit(UnitType.INFANTRY);
    const art = makeUnit(UnitType.ARTILLERY);
    const map = applyArtilleryBoost([inf1, inf2, art]);
    // Exactly one infantry should be boosted to 2
    const boostedCount = [inf1, inf2].filter(
      (u) => map.get(u.id) === 2,
    ).length;
    expect(boostedCount).toBe(1);
    // The other infantry stays at 1
    const unboostedCount = [inf1, inf2].filter(
      (u) => map.get(u.id) === 1,
    ).length;
    expect(unboostedCount).toBe(1);
  });

  it('does not boost infantry when there is no artillery', () => {
    const inf = makeUnit(UnitType.INFANTRY);
    const map = applyArtilleryBoost([inf]);
    expect(map.get(inf.id)).toBe(1);
  });

  it('two artillery boost two infantry', () => {
    const units = [
      makeUnit(UnitType.INFANTRY),
      makeUnit(UnitType.INFANTRY),
      makeUnit(UnitType.ARTILLERY),
      makeUnit(UnitType.ARTILLERY),
    ];
    const map = applyArtilleryBoost(units);
    const infantry = units.filter((u) => u.type === UnitType.INFANTRY);
    const boosted = infantry.filter((u) => map.get(u.id) === 2).length;
    expect(boosted).toBe(2);
  });

  it('returns base attack for non-infantry non-artillery units', () => {
    const tank = makeUnit(UnitType.TANK);
    const map = applyArtilleryBoost([tank]);
    expect(map.get(tank.id)).toBe(3); // tank attack = 3
  });
});

// ---------------------------------------------------------------------------
// Battleship two-hit rule
// ---------------------------------------------------------------------------

describe('Battleship two-hit rule (via resolveCombatRound)', () => {
  it('a battleship absorbs the first hit as disabled, not destroyed', () => {
    // 1 attacker infantry vs 1 healthy battleship
    // We'll run many rounds until the battleship takes a hit and check state
    const inf = makeUnit(UnitType.INFANTRY, PowerName.USSR);
    const bs = makeUnit(UnitType.BATTLESHIP, PowerName.GERMANY);
    const state = makeState([inf], [bs]);

    const result = resolveCombatRound(state);

    // If defenders took any hits from the infantry
    if (result.defenderHits > 0) {
      // The battleship should be disabled (damaged), not in casualties
      expect(result.defenderCasualties).toHaveLength(0);
      expect(result.updatedDefenders).toHaveLength(1);
      expect(result.updatedDefenders[0].isDisabled).toBe(true);
    } else {
      // No hits — battleship untouched, still healthy
      expect(result.updatedDefenders[0].isDisabled).toBe(false);
    }
  });

  it('a disabled battleship is removed on the second hit', () => {
    const inf = makeUnit(UnitType.INFANTRY, PowerName.USSR);
    // Start with a DISABLED (already hit) battleship
    const disabledBs = makeUnit(UnitType.BATTLESHIP, PowerName.GERMANY, true);
    const state = makeState([inf], [disabledBs]);

    const result = resolveCombatRound(state);

    if (result.defenderHits > 0) {
      // Second hit — battleship should now appear in casualties
      expect(result.defenderCasualties).toHaveLength(1);
      expect(result.updatedDefenders).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// isCombatOver
// ---------------------------------------------------------------------------

describe('isCombatOver', () => {
  it('returns true when all attackers are eliminated', () => {
    const state = makeState([], [makeUnit(UnitType.INFANTRY)]);
    expect(isCombatOver(state)).toBe(true);
  });

  it('returns true when all defenders are eliminated', () => {
    const state = makeState([makeUnit(UnitType.INFANTRY)], []);
    expect(isCombatOver(state)).toBe(true);
  });

  it('returns false when both sides still have units', () => {
    const state = makeState(
      [makeUnit(UnitType.INFANTRY)],
      [makeUnit(UnitType.INFANTRY)],
    );
    expect(isCombatOver(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canAttackerCapture
// ---------------------------------------------------------------------------

describe('canAttackerCapture', () => {
  it('returns true when attacker wins with a land unit', () => {
    const state = makeState([makeUnit(UnitType.INFANTRY, PowerName.USSR)], []);
    expect(canAttackerCapture(state)).toBe(true);
  });

  it('returns false when attacker wins with only aircraft', () => {
    const state = makeState([makeUnit(UnitType.FIGHTER, PowerName.USSR)], []);
    expect(canAttackerCapture(state)).toBe(false);
  });

  it('returns false when combat is not over', () => {
    const state = makeState(
      [makeUnit(UnitType.INFANTRY, PowerName.USSR)],
      [makeUnit(UnitType.INFANTRY, PowerName.GERMANY)],
    );
    expect(canAttackerCapture(state)).toBe(false);
  });

  it('returns false when attackers are all eliminated', () => {
    const state = makeState([], [makeUnit(UnitType.INFANTRY, PowerName.GERMANY)]);
    expect(canAttackerCapture(state)).toBe(false);
  });
});
