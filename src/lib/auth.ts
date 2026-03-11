import { createHash } from "crypto";
import { getMockUserInfo } from "./mock-oidc";

export interface AuthResult {
  sub: string;
  address: string;
}

export function getAuthConfig() {
  const useMock = process.env.USE_MOCK_AUTH === "true";
  if (useMock) {
    return {
      issuer: "http://localhost:3001",
      authorizationEndpoint: "http://localhost:3001/authorize",
      tokenEndpoint: "http://localhost:3001/token",
      userinfoEndpoint: "http://localhost:3001/userinfo",
      useMock: true,
    };
  }

  const issuer = process.env.DIGITAL_AUTH_ISSUER!;
  return {
    issuer,
    authorizationEndpoint: `${issuer}/api/realms/main/protocol/openid-connect/auth`,
    tokenEndpoint: `${issuer}/api/realms/main/protocol/openid-connect/token`,
    userinfoEndpoint: `${issuer}/api/realms/main/protocol/openid-connect/userinfo`,
    useMock: false,
  };
}

export function hashSubject(sub: string): string {
  return createHash("sha256").update(sub).digest("hex");
}

export async function authenticateMockUser(
  userId: string
): Promise<AuthResult | null> {
  const user = getMockUserInfo(userId);
  if (!user) return null;
  return {
    sub: user.sub,
    address: user.address,
  };
}
