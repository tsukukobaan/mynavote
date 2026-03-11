import { randomBytes, timingSafeEqual } from "crypto";

export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

export function verifyCsrfToken(
  sessionToken: string,
  requestToken: string
): boolean {
  if (!sessionToken || !requestToken) return false;
  const a = Buffer.from(sessionToken);
  const b = Buffer.from(requestToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
