import { NextRequest, NextResponse } from "next/server";
import { MOCK_USERS } from "@/lib/mock-oidc";
import { authenticateMockUser, hashSubject } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { getDistrict } from "@/lib/district";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { checkAuthRateLimit } from "@/lib/rate-limit";

// GET: Return list of mock users (without sensitive data)
export async function GET() {
  if (process.env.USE_MOCK_AUTH !== "true") {
    return NextResponse.json({ error: "Mock auth is disabled" }, { status: 403 });
  }

  const users = MOCK_USERS.map((u) => ({
    sub: u.sub,
    name: u.name,
    address: u.address,
  }));
  return NextResponse.json({ users });
}

// POST: Authenticate as a mock user
export async function POST(request: NextRequest) {
  if (process.env.USE_MOCK_AUTH !== "true") {
    return NextResponse.json({ error: "Mock auth is disabled" }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimit = await checkAuthRateLimit(ip);
  if (!rateLimit.allowed) {
    await writeAuditLog(AuditAction.AUTH_RATE_LIMITED, { ip });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { userId: string; electionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.userId || typeof body.userId !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await writeAuditLog(AuditAction.AUTH_START, { ip });

  const result = await authenticateMockUser(body.userId);
  if (!result) {
    await writeAuditLog(AuditAction.AUTH_FAILURE, { ip });
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  const subjectHash = hashSubject(result.sub);
  const district = getDistrict(result.address);
  // Address is NOT stored in session - only district
  const session = await createSession(subjectHash, district, body.electionId);

  await writeAuditLog(AuditAction.AUTH_SUCCESS, {
    ip,
    electionId: body.electionId,
  });

  return NextResponse.json({
    authenticated: true,
    district,
    csrfToken: session.csrfToken,
  });
}
