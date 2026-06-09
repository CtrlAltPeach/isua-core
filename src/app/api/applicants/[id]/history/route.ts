// GET /api/applicants/[id]/history — журнал изменений абитуриента.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const applicantId = Number((await params).id);
  if (!Number.isInteger(applicantId) || applicantId <= 0) {
    return fail("Некорректный id", 400);
  }

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const entries = await prisma.history.findMany({
    where: { applicantId },
    orderBy: { changedAt: "desc" },
    skip: offset,
    take: limit,
    select: {
      id: true,
      fieldName: true,
      oldValue: true,
      newValue: true,
      changedAt: true,
      changedBy: { select: { id: true, username: true, email: true } },
    },
  });

  return ok(entries);
}
