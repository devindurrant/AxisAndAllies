/**
 * Axis & Allies 1942 2nd Edition — core enumerations.
 */

/** The five major powers in the game, listed in turn order. */
export enum PowerName {
  USSR = "USSR",
  GERMANY = "GERMANY",
  UK = "UK",
  JAPAN = "JAPAN",
  USA = "USA",
}

/** The six sequential phases that make up each power's turn. */
export enum TurnPhase {
  PURCHASE_UNITS = "PURCHASE_UNITS",
  COMBAT_MOVE = "COMBAT_MOVE",
  CONDUCT_COMBAT = "CONDUCT_COMBAT",
  NONCOMBAT_MOVE = "NONCOMBAT_MOVE",
  MOBILIZE_UNITS = "MOBILIZE_UNITS",
  COLLECT_INCOME = "COLLECT_INCOME",
}

/** Every purchasable or placeable unit in the game. */
export enum UnitType {
  INFANTRY = "INFANTRY",
  ARTILLERY = "ARTILLERY",
  TANK = "TANK",
  FIGHTER = "FIGHTER",
  BOMBER = "BOMBER",
  SUBMARINE = "SUBMARINE",
  DESTROYER = "DESTROYER",
  CARRIER = "CARRIER",
  BATTLESHIP = "BATTLESHIP",
  AA_GUN = "AA_GUN",
  INDUSTRIAL_COMPLEX = "INDUSTRIAL_COMPLEX",
  TRANSPORT = "TRANSPORT",
}

/** Lifecycle state for a game session. */
export enum GameStatus {
  LOBBY = "LOBBY",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  ABANDONED = "ABANDONED",
}

/** Whether a map territory is land or a sea zone. */
export enum TerritoryType {
  LAND = "LAND",
  SEA = "SEA",
}
