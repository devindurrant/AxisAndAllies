/**
 * Application configuration loaded from environment variables.
 * Required variables throw at startup if absent.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  port: parseInt(optionalEnv("PORT", "3001"), 10),
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  databaseUrl: requireEnv("DATABASE_URL"),
  redisUrl: optionalEnv("REDIS_URL", "redis://localhost:6379"),
  sessionSecret: requireEnv("SESSION_SECRET"),
  webUrl: optionalEnv("WEB_URL", "http://localhost:5173"),
  resendApiKey: process.env["RESEND_API_KEY"],
  emailFrom: optionalEnv("EMAIL_FROM", "noreply@axisandallies.local"),
} as const;

export type Config = typeof config;
