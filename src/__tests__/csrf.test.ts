import { describe, it, expect } from "vitest";
import { generateCsrfToken, verifyCsrfToken } from "@/lib/csrf";

describe("CSRF", () => {
  it("generates a 64-character hex string", () => {
    const token = generateCsrfToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it("generates unique tokens", () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    expect(token1).not.toBe(token2);
  });

  it("verifies matching tokens", () => {
    const token = generateCsrfToken();
    expect(verifyCsrfToken(token, token)).toBe(true);
  });

  it("rejects different tokens", () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    expect(verifyCsrfToken(token1, token2)).toBe(false);
  });

  it("rejects empty session token", () => {
    expect(verifyCsrfToken("", "abc")).toBe(false);
  });

  it("rejects empty request token", () => {
    expect(verifyCsrfToken("abc", "")).toBe(false);
  });

  it("rejects different length tokens", () => {
    expect(verifyCsrfToken("abc", "abcd")).toBe(false);
  });
});
