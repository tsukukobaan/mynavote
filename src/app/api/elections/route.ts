import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Public election list (no admin auth required)
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
      candidates: e.candidates.map((c) => ({ id: c.id, name: c.name })),
      voteCount: e._count.ballots,
    })),
  });
}
