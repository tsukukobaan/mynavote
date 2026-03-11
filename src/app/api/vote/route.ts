import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { verifyCsrfToken } from "@/lib/csrf";
import { voteRequestSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { createBallotHmac, computeChainHash } from "@/lib/integrity";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { checkVoteRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";

  // 1. Session check
  const session = await getSession();
  if (!session || !session.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limit
  const rateLimit = await checkVoteRateLimit(session.id);
  if (!rateLimit.allowed) {
    await writeAuditLog(AuditAction.SUSPICIOUS_ACTIVITY, {
      ip,
      electionId: session.electionId,
      metadata: { reason: "vote_rate_limited" },
    });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // 3. Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = voteRequestSchema.safeParse(body);
  if (!parsed.success) {
    await writeAuditLog(AuditAction.INVALID_INPUT, { ip });
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { electionId, encryptedVote, ballotTracker, csrfToken } = parsed.data;

  // 4. CSRF check
  if (!verifyCsrfToken(session.csrfToken, csrfToken)) {
    await writeAuditLog(AuditAction.CSRF_VIOLATION, { ip, electionId });
    return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  }

  // 5. Election check
  const election = await prisma.election.findUnique({
    where: { id: electionId },
  });

  if (!election || election.status !== "OPEN") {
    return NextResponse.json(
      { error: "Election is not open for voting" },
      { status: 400 }
    );
  }

  const now = new Date();
  if (now < election.votingStartAt || now > election.votingEndAt) {
    return NextResponse.json(
      { error: "Outside voting period" },
      { status: 400 }
    );
  }

  // 6. Eligibility check (district)
  await writeAuditLog(AuditAction.VOTE_ELIGIBILITY_CHECK, {
    ip,
    electionId,
  });

  if (election.districtId && session.district !== election.districtId) {
    await writeAuditLog(AuditAction.VOTE_ELIGIBILITY_DENIED, {
      ip,
      electionId,
    });
    return NextResponse.json(
      { error: "Not eligible for this election" },
      { status: 403 }
    );
  }

  // 7. Check/create voter registry and handle revote
  const timestamp = now.toISOString();
  const hmac = createBallotHmac(encryptedVote, electionId, timestamp);

  // Get the latest ballot for chain hash
  const latestBallot = await prisma.ballot.findFirst({
    where: { electionId },
    orderBy: { timestamp: "desc" },
    select: { encryptedVote: true, previousHash: true, timestamp: true },
  });

  let previousHash = "genesis";
  if (latestBallot) {
    previousHash = computeChainHash(
      latestBallot.previousHash,
      latestBallot.encryptedVote,
      latestBallot.timestamp.toISOString()
    );
  }

  // Transaction: create ballot + update voter registry atomically
  const result = await prisma.$transaction(async (tx) => {
    // Find or create voter registry
    let registry = await tx.voterRegistry.findUnique({
      where: {
        electionId_subjectHash: {
          electionId,
          subjectHash: session.subjectHash,
        },
      },
    });

    const isRevote = registry?.hasVoted ?? false;

    if (isRevote && !election.allowRevote) {
      return { error: "Already voted and revote is not allowed" };
    }

    // If revoting, mark old ballot as not latest
    if (isRevote && registry?.latestBallotId) {
      await tx.ballot.update({
        where: { id: registry.latestBallotId },
        data: { isLatest: false },
      });
    }

    // Create new ballot
    const ballot = await tx.ballot.create({
      data: {
        electionId,
        encryptedVote,
        ballotTracker,
        hmac,
        previousHash,
        isLatest: true,
        timestamp: now,
      },
    });

    // Update chain hash on election
    const newChainHash = computeChainHash(
      previousHash,
      encryptedVote,
      timestamp
    );
    await tx.election.update({
      where: { id: electionId },
      data: { latestChainHash: newChainHash },
    });

    // Upsert voter registry
    if (registry) {
      await tx.voterRegistry.update({
        where: { id: registry.id },
        data: {
          hasVoted: true,
          latestBallotId: ballot.id,
          voteCount: { increment: 1 },
          votedAt: now,
        },
      });
    } else {
      await tx.voterRegistry.create({
        data: {
          electionId,
          subjectHash: session.subjectHash,
          district: session.district,
          hasVoted: true,
          latestBallotId: ballot.id,
          voteCount: 1,
          votedAt: now,
        },
      });
    }

    return { ballot, isRevote };
  });

  if ("error" in result) {
    await writeAuditLog(AuditAction.VOTE_DUPLICATE_ATTEMPT, {
      ip,
      electionId,
    });
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await writeAuditLog(
    result.isRevote ? AuditAction.VOTE_REVOTE : AuditAction.VOTE_CAST,
    { ip, electionId }
  );

  return NextResponse.json({
    success: true,
    ballotTracker: result.ballot.ballotTracker,
    isRevote: result.isRevote,
  });
}
