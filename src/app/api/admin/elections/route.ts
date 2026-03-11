import { NextRequest, NextResponse } from "next/server";
import { createElectionSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { generateElectionKeys } from "@/lib/crypto";
import { writeAuditLog, AuditAction } from "@/lib/audit";

// POST: Create a new election
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = createElectionSchema.safeParse(body);
  if (!parsed.success) {
    await writeAuditLog(AuditAction.INVALID_INPUT, { ip });
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { title, description, districtId, votingStartAt, votingEndAt, allowRevote, candidates } = parsed.data;

  // Generate election keypair
  const keys = await generateElectionKeys();

  const election = await prisma.election.create({
    data: {
      title,
      description,
      districtId,
      votingStartAt: new Date(votingStartAt),
      votingEndAt: new Date(votingEndAt),
      publicKey: keys.publicKey,
      allowRevote,
      candidates: {
        create: candidates.map((c, i) => ({
          name: c.name,
          profile: c.profile,
          displayOrder: i,
        })),
      },
    },
    include: { candidates: true },
  });

  await writeAuditLog(AuditAction.ELECTION_CREATED, {
    ip,
    electionId: election.id,
  });

  return NextResponse.json({
    election: {
      id: election.id,
      title: election.title,
      status: election.status,
      publicKey: election.publicKey,
      candidates: election.candidates,
    },
    // Secret key is returned ONLY at creation time. Store it securely offline.
    secretKey: keys.secretKey,
  });
}

// GET: List elections
export async function GET() {
  const elections = await prisma.election.findMany({
    include: {
      candidates: { orderBy: { displayOrder: "asc" } },
      _count: { select: { ballots: { where: { isLatest: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    elections: elections.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      status: e.status,
      districtId: e.districtId,
      votingStartAt: e.votingStartAt,
      votingEndAt: e.votingEndAt,
      allowRevote: e.allowRevote,
      publicKey: e.publicKey,
      candidates: e.candidates,
      voteCount: e._count.ballots,
    })),
  });
}
