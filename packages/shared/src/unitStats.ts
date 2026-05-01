/**
 * Axis & Allies 1942 2nd Edition — unit statistics.
 *
 * All values sourced from the official rulebook:
 *   attack / defense are the maximum die roll that scores a hit (1–6).
 *   movement is the number of territories a unit may move per turn.
 *   cost is the IPC purchase price.
 *   canCarry is the number of units the vessel/vehicle may transport.
 */

import { UnitType } from "./enums.js";

export interface UnitStats {
  /** IPC cost to purchase one unit. */
  cost: number;
  /** Maximum die value that counts as a hit when attacking (inclusive). */
  attack: number;
  /** Maximum die value that counts as a hit when defending (inclusive). */
  defense: number;
  /** Maximum number of territories the unit may traverse per phase. */
  movement: number;
  /**
   * For carriers and transports: how many units may ride along.
   * Absent on units that cannot carry.
   */
  canCarry?: number;
  /**
   * Rule tags that the combat / movement engine uses to apply special logic.
   * Kept as string literals for easy serialisation across the wire.
   */
  specialRules: string[];
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  [UnitType.INFANTRY]: {
    cost: 3,
    attack: 1,
    defense: 2,
    movement: 1,
    specialRules: ["artillery_boost"],
  },

  [UnitType.ARTILLERY]: {
    cost: 4,
    attack: 2,
    defense: 2,
    movement: 1,
    specialRules: ["boosts_infantry"],
  },

  [UnitType.TANK]: {
    cost: 6,
    attack: 3,
    defense: 3,
    movement: 2,
    specialRules: ["blitz"],
  },

  [UnitType.FIGHTER]: {
    cost: 10,
    attack: 3,
    defense: 4,
    movement: 4,
    specialRules: ["must_land", "carrier_capable"],
  },

  [UnitType.BOMBER]: {
    cost: 12,
    attack: 4,
    defense: 1,
    movement: 6,
    specialRules: ["must_land", "strategic_bombing"],
  },

  [UnitType.SUBMARINE]: {
    cost: 6,
    attack: 2,
    defense: 1,
    movement: 2,
    specialRules: ["first_strike", "submerge"],
  },

  [UnitType.DESTROYER]: {
    cost: 8,
    attack: 3,
    defense: 3,
    movement: 2,
    specialRules: ["cancels_sub_special"],
  },

  [UnitType.CARRIER]: {
    cost: 14,
    attack: 1,
    defense: 2,
    movement: 2,
    canCarry: 2,
    specialRules: ["carries_fighters"],
  },

  [UnitType.BATTLESHIP]: {
    cost: 20,
    attack: 4,
    defense: 4,
    movement: 2,
    specialRules: ["two_hit", "shore_bombardment"],
  },

  [UnitType.AA_GUN]: {
    cost: 5,
    attack: 0,
    defense: 0,
    movement: 1,
    specialRules: ["aa_fire"],
  },

  [UnitType.INDUSTRIAL_COMPLEX]: {
    cost: 15,
    attack: 0,
    defense: 0,
    movement: 0,
    specialRules: ["immobile", "production"],
  },

  [UnitType.TRANSPORT]: {
    cost: 7,
    attack: 0,
    defense: 1,
    movement: 2,
    canCarry: 2,
    specialRules: ["naval_transport"],
  },
};
