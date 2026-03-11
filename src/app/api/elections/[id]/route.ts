import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const election = await prisma.election.findUnique({
    where: { id },
    include: {
      candidates: { orderBy: { displayOrder: "asc" } },
      results: true,
      _count: { select: { ballots: { where: { isLatest: true } } } },
    },
  });

  if (!election) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: election.id,
    title: election.title,
    description: election.description,
    status: election.status,
    districtId: election.districtId,
    votingStartAt: election.votingStartAt,
    votingEndAt: election.votingEndAt,
    publicKey: election.publicKey,
    allowRevote: election.allowRevote,
    candidates: election.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      profile: c.profile,
    })),
    voteCount: election._count.ballots,
    results:
      election.status === "FINALIZED"
        ? election.results.map((r) => ({
            candidateId: r.candidateId,
            voteCount: r.voteCount,
          }))
        : undefined,
  });
}
