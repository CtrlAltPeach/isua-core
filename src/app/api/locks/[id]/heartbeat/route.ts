// POST /api/locks/[id]/heartbeat — продлить свой лок.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const applicantId = Number((await params).id);
  if (!Number.isInteger(applicantId) || applicantId <= 0) {
    return fail("Некорректный id", 400);
  }

  const body = await req.json().catch(() => null);
  const sessionId = body?.userSessionId;
  if (typeof sessionId !== "string" || !sessionId) {
    return fail("Не передан userSessionId", 400);
  }

  const existing = await prisma.lock.findUnique({ where: { applicantId } });
  // Продлеваем только свой активный лок.
  if (!existing || existing.userSessionId !== sessionId) {
    return ok({ ok: false });
  }

  await prisma.lock.update({
    where: { applicantId },
    data: { lastHeartbeat: new Date() },
  });
  return ok({ ok: true });
}
