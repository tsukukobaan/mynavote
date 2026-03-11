import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { z } from "zod";

const statusSchema = z.object({
  status: z.enum(["DRAFT", "OPEN", "CLOSED", "COUNTING", "FINALIZED"]),
});

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["OPEN"],
  OPEN: ["CLOSED"],
  CLOSED: ["COUNTING"],
  COUNTING: ["FINALIZED"],
  FINALIZED: [],
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const election = await prisma.election.findUnique({ where: { id } });
  if (!election) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowedNext = VALID_TRANSITIONS[election.status] ?? [];
  if (!allowedNext.includes(parsed.data.status)) {
    return NextResponse.json(
      {
        error: `Cannot transition from ${election.status} to ${parsed.data.status}`,
      },
      { status: 400 }
    );
  }

  const updated = await prisma.election.update({
    where: { id },
    data: { status: parsed.data.status as never },
  });

  await writeAuditLog(AuditAction.ELECTION_STATUS_CHANGED, {
    ip,
    electionId: id,
    metadata: {
      from: election.status,
      to: parsed.data.status,
    },
  });

  return NextResponse.json({ election: updated });
}
