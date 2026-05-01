/**
 * Server-side cryptographically secure dice service.
 *
 * Uses Node.js `crypto.randomInt` instead of `Math.random` so that dice
 * outcomes cannot be predicted or manipulated by clients.
 */

import { randomInt } from "crypto";

/**
 * Roll `count` six-sided dice using `crypto.randomInt`.
 * Each result is an integer in [1, 6].
 *
 * @param count - Number of dice to roll. Must be >= 0.
 * @returns Array of `count` random integers in [1, 6].
 */
export function rollDice(count: number): number[] {
  if (count < 0) {
    throw new RangeError(`rollDice: count must be >= 0, got ${count}`);
  }
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    // randomInt(min, max) returns min <= n < max, so max must be 7 to get 1–6.
    results.push(randomInt(1, 7));
  }
  return results;
}

/**
 * Count how many values in `rolls` are <= `threshold` (i.e. "hits").
 * A threshold of 0 means no hits are possible.
 *
 * @param rolls     - Array of die roll values.
 * @param threshold - Maximum value that scores a hit.
 * @returns Number of rolls that are <= threshold.
 */
export function countHits(rolls: number[], threshold: number): number {
  if (threshold <= 0) return 0;
  return rolls.filter((r) => r <= threshold).length;
}
