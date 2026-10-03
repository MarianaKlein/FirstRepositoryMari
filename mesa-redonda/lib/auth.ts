import { createHash, timingSafeEqual } from "node:crypto";

export type AuthResult = "ok" | "unauthorized";

const digest = (value: string) => createHash("sha256").update(value).digest();

// The password gate is optional: with APP_PASSWORD unset the app is open.
export const passwordRequired = () => Boolean(process.env.APP_PASSWORD);

export function checkPassword(candidate: string | null): AuthResult {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return "ok";
  if (!candidate) return "unauthorized";
  return timingSafeEqual(digest(candidate), digest(expected)) ? "ok" : "unauthorized";
}
