import { cookies } from "next/headers";
import { getRedis } from "./redis";
import { generateCsrfToken } from "./csrf";
import { v4 as uuidv4 } from "uuid";

export interface VotingSession {
  id: string;
  subjectHash: string;
  district: string | null;
  authenticated: boolean;
  authenticatedAt: number;
  csrfToken: string;
  electionId?: string;
}

const SESSION_PREFIX = "session:";
const SESSION_TTL = 15 * 60; // 15 minutes
const COOKIE_NAME = "session_id";

export async function createSession(
  subjectHash: string,
  district: string | null,
  electionId?: string
): Promise<VotingSession> {
  const redis = getRedis();
  const sessionId = uuidv4();
  const csrfToken = generateCsrfToken();

  const session: VotingSession = {
    id: sessionId,
    subjectHash,
    district,
    authenticated: true,
    authenticatedAt: Date.now(),
    csrfToken,
    electionId,
  };

  await redis.set(
    SESSION_PREFIX + sessionId,
    JSON.stringify(session),
    "EX",
    SESSION_TTL
  );

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL,
    path: "/",
  });

  return session;
}

export async function getSession(): Promise<VotingSession | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const redis = getRedis();
  const data = await redis.get(SESSION_PREFIX + sessionId);
  if (!data) return null;

  const session: VotingSession = JSON.parse(data);

  // Check if session has expired (authenticatedAt + 15min)
  if (Date.now() - session.authenticatedAt > SESSION_TTL * 1000) {
    await destroySession();
    return null;
  }

  return session;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionId) return;

  const redis = getRedis();
  await redis.del(SESSION_PREFIX + sessionId);
  cookieStore.delete(COOKIE_NAME);
}
