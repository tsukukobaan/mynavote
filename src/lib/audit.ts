import { prisma } from "./prisma";
import { createHash } from "crypto";

export enum AuditAction {
  AUTH_START = "AUTH_START",
  AUTH_SUCCESS = "AUTH_SUCCESS",
  AUTH_FAILURE = "AUTH_FAILURE",
  AUTH_RATE_LIMITED = "AUTH_RATE_LIMITED",
  VOTE_ELIGIBILITY_CHECK = "VOTE_ELIGIBILITY_CHECK",
  VOTE_ELIGIBILITY_DENIED = "VOTE_ELIGIBILITY_DENIED",
  VOTE_CAST = "VOTE_CAST",
  VOTE_REVOTE = "VOTE_REVOTE",
  VOTE_DUPLICATE_ATTEMPT = "VOTE_DUPLICATE_ATTEMPT",
  ELECTION_CREATED = "ELECTION_CREATED",
  ELECTION_STATUS_CHANGED = "ELECTION_STATUS_CHANGED",
  COUNTING_STARTED = "COUNTING_STARTED",
  COUNTING_COMPLETED = "COUNTING_COMPLETED",
  CSRF_VIOLATION = "CSRF_VIOLATION",
  INVALID_INPUT = "INVALID_INPUT",
  SUSPICIOUS_ACTIVITY = "SUSPICIOUS_ACTIVITY",
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export async function writeAuditLog(
  action: AuditAction,
  options?: {
    electionId?: string;
    ip?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        electionId: options?.electionId,
        metadata: {
          ...(options?.metadata ?? {}),
          ...(options?.ip ? { ipHash: hashIp(options.ip) } : {}),
        },
      },
    });
  } catch (error) {
    // Audit log failure should not break the main flow
    console.error("[AuditLog] Failed to write:", action, error);
  }
}
