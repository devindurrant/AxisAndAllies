/**
 * Notification service — sends email and/or Socket.io events when it's a
 * player's turn.
 */

import type { Server as SocketServer } from "socket.io";
import { PowerName, TurnPhase } from "@aa/shared";
import { db } from "../db.js";
import { config } from "../config.js";

// ─── NotificationService ──────────────────────────────────────────────────────

export class NotificationService {
  private readonly io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Notify a player that it is their turn.
   *
   * - Emits a `game:your_turn` Socket.io event to the game room so all
   *   connected clients can react.
   * - Sends an email via Resend if an API key is configured.
   */
  async notifyPlayerTurn(
    gameId: string,
    userId: string,
    power: PowerName,
    phase: TurnPhase,
  ): Promise<void> {
    // Emit socket event to the game room
    this.io.to(`game:${gameId}`).emit("game:your_turn", {
      gameId,
      userId,
      power,
      phase,
    });

    // Send email notification if Resend is configured
    if (config.resendApiKey) {
      await this.sendTurnEmail(gameId, userId, power, phase);
    }
  }

  /**
   * Emit a generic game state update event to all players in the room.
   */
  emitGameStateUpdated(gameId: string, payload: Record<string, unknown>): void {
    this.io.to(`game:${gameId}`).emit("game:state_updated", {
      gameId,
      ...payload,
    });
  }

  /**
   * Emit a combat result event.
   */
  emitCombatResult(
    gameId: string,
    territoryKey: string,
    result: Record<string, unknown>,
  ): void {
    this.io.to(`game:${gameId}`).emit("game:combat_result", {
      gameId,
      territoryKey,
      ...result,
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async sendTurnEmail(
    gameId: string,
    userId: string,
    power: PowerName,
    phase: TurnPhase,
  ): Promise<void> {
    // Look up the user's email address
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, username: true },
    });

    if (!user) return;

    const game = await db.game.findUnique({
      where: { id: gameId },
      select: { name: true },
    });

    if (!game) return;

    const phaseLabel = phase.replace(/_/g, " ").toLowerCase();
    const powerLabel = power.charAt(0) + power.slice(1).toLowerCase();

    try {
      // Dynamic import to avoid startup errors when Resend is not installed
      const { Resend } = await import("resend");
      const resend = new Resend(config.resendApiKey);

      await resend.emails.send({
        from: config.emailFrom,
        to: user.email,
        subject: `[Axis & Allies] Your turn: ${powerLabel} — ${phaseLabel}`,
        html: `
          <p>Hi ${user.username},</p>
          <p>
            It is your turn in <strong>${game.name}</strong>.
          </p>
          <p>
            You are playing as <strong>${powerLabel}</strong> and must complete
            the <strong>${phaseLabel}</strong> phase.
          </p>
          <p>
            <a href="${config.webUrl}/games/${gameId}">Click here to play</a>
          </p>
        `,
      });
    } catch (err) {
      // Non-fatal — log and continue
      console.error("Failed to send turn notification email:", err);
    }
  }
}
