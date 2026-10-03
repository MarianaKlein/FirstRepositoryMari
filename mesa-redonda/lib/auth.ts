import { createHash, timingSafeEqual } from "node:crypto";

export type AuthResult = "ok" | "unauthorized" | "not-configured";

const digest = (value: string) => createHash("sha256").update(value).digest();

// Fails closed: if APP_PASSWORD is not set, nobody gets in.
export function checkPassword(candidate: string | null): AuthResult {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return "not-configured";
  if (!candidate) return "unauthorized";
  return timingSafeEqual(digest(candidate), digest(expected)) ? "ok" : "unauthorized";
}
