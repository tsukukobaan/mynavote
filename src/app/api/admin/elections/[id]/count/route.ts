import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptBallot } from "@/lib/crypto";
import { verifyBallotHmac, verifyBallotChain } from "@/lib/integrity";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { countElectionSchema } from "@/lib/validation";
import { verifyCsrfToken } from "@/lib/csrf";
import { getSession } from "@/lib/session";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";

  // For admin counting, we check admin token via middleware
  // but also accept CSRF from session for web UI
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = countElectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Optional CSRF check (if session exists)
  const session = await getSession();
  if (session && !verifyCsrfToken(session.csrfToken, parsed.data.csrfToken)) {
    await writeAuditLog(AuditAction.CSRF_VIOLATION, { ip, electionId: id });
    return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  }

  const election = await prisma.election.findUnique({
    where: { id },
    include: {
      candidates: true,
    },
  });

  if (!election) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (election.status !== "COUNTING") {
    return NextResponse.json(
      { error: "Election must be in COUNTING status" },
      { status: 400 }
    );
  }

  await writeAuditLog(AuditAction.COUNTING_STARTED, { ip, electionId: id });

  // 1. Fetch all ballots in order
  const allBallots = await prisma.ballot.findMany({
    where: { electionId: id },
    orderBy: { timestamp: "asc" },
  });

  // 2. Verify hash chain
  if (election.latestChainHash) {
    const chainValid = verifyBallotChain(allBallots, election.latestChainHash);
    if (!chainValid) {
      return NextResponse.json(
        { error: "Ballot chain integrity verification failed" },
        { status: 500 }
      );
    }
  }

  // 3. Verify HMAC of all ballots
  for (const ballot of allBallots) {
    const hmacValid = verifyBallotHmac(
      ballot.encryptedVote,
      id,
      ballot.timestamp.toISOString(),
      ballot.hmac
    );
    if (!hmacValid) {
      return NextResponse.json(
        { error: "Ballot HMAC verification failed" },
        { status: 500 }
      );
    }
  }

  // 4. Validate: isLatest count == hasVoted count
  const latestBallots = allBallots.filter((b) => b.isLatest);
  const votedCount = await prisma.voterRegistry.count({
    where: { electionId: id, hasVoted: true },
  });

  if (latestBallots.length !== votedCount) {
    return NextResponse.json(
      { error: "Vote count mismatch between ballots and registry" },
      { status: 500 }
    );
  }

  // 5. Decrypt only isLatest ballots and count
  const candidateCounts: Record<string, number> = {};
  for (const candidate of election.candidates) {
    candidateCounts[candidate.id] = 0;
  }

  const errors: string[] = [];
  for (const ballot of latestBallots) {
    try {
      const { candidateId } = await decryptBallot(
        ballot.encryptedVote,
        election.publicKey,
        parsed.data.secretKey
      );
      if (candidateId in candidateCounts) {
        candidateCounts[candidateId]++;
      } else {
        errors.push(`Unknown candidateId in ballot ${ballot.id}`);
      }
    } catch {
      return NextResponse.json(
        { error: "Failed to decrypt ballots. Check the secret key." },
        { status: 400 }
      );
    }
  }

  // 6. Save results
  await prisma.$transaction(async (tx) => {
    // Delete any existing results for re-count scenario
    await tx.electionResult.deleteMany({ where: { electionId: id } });

    for (const [candidateId, voteCount] of Object.entries(candidateCounts)) {
      await tx.electionResult.create({
        data: {
          electionId: id,
          candidateId,
          voteCount,
        },
      });
    }

    await tx.election.update({
      where: { id },
      data: { status: "FINALIZED" },
    });
  });

  await writeAuditLog(AuditAction.COUNTING_COMPLETED, {
    ip,
    electionId: id,
    metadata: { totalVotes: latestBallots.length },
  });

  // Build results response
  const results = election.candidates.map((c) => ({
    candidateId: c.id,
    candidateName: c.name,
    voteCount: candidateCounts[c.id] ?? 0,
  }));

  return NextResponse.json({
    success: true,
    totalVotes: latestBallots.length,
    results: results.sort((a, b) => b.voteCount - a.voteCount),
    warnings: errors.length > 0 ? errors : undefined,
  });
}
