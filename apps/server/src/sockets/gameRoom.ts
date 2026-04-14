/**
 * Socket.io game room management.
 *
 * Provides helpers for joining/leaving game rooms and emitting typed events.
 * Room names follow the convention `game:<gameId>`.
 */

import type { Server as SocketServer, Socket } from "socket.io";

// ─── Room helpers ─────────────────────────────────────────────────────────────

/**
 * Join a socket to the room for the specified game.
 */
export function joinGameRoom(socket: Socket, gameId: string): void {
  const room = `game:${gameId}`;
  void socket.join(room);
}

/**
 * Remove a socket from the room for the specified game.
 */
export function leaveGameRoom(socket: Socket, gameId: string): void {
  const room = `game:${gameId}`;
  void socket.leave(room);
}

/**
 * Broadcast an event to all clients in the game room.
 */
export function emitToGame(
  io: SocketServer,
  gameId: string,
  event: GameEvent,
  data: unknown,
): void {
  io.to(`game:${gameId}`).emit(event, data);
}

// ─── Typed event names ────────────────────────────────────────────────────────

export type GameEvent =
  | "game:state_updated"
  | "game:your_turn"
  | "game:combat_result"
  | "game:player_connected"
  | "game:player_disconnected";

// ─── Socket event payloads ────────────────────────────────────────────────────

export interface GameStateUpdatedPayload {
  gameId: string;
  activePower: string;
  activePhase: string;
  currentRound: number;
}

export interface YourTurnPayload {
  gameId: string;
  userId: string;
  power: string;
  phase: string;
  round: number;
}

export interface CombatResultPayload {
  gameId: string;
  territoryKey: string;
  attackDice: number[];
  defenseDice: number[];
  attackHits: number;
  defenseHits: number;
  attackerWins: boolean;
  defenderWins: boolean;
}

export interface PlayerConnectedPayload {
  gameId: string;
  userId: string;
  username: string;
}

export interface PlayerDisconnectedPayload {
  gameId: string;
  userId: string;
  username: string;
}
