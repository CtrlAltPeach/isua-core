// /api/locks/[id] — POST (захватить лок), DELETE (снять свой лок).
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import { isStale } from "@/lib/locks";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const applicantId = parseId((await params).id);
  if (!applicantId) return fail("Некорректный id", 400);

  const body = await req.json().catch(() => null);
  const sessionId = body?.userSessionId;
  if (typeof sessionId !== "string" || !sessionId) {
    return fail("Не передан userSessionId", 400);
  }

  const existing = await prisma.lock.findUnique({ where: { applicantId } });

  // Лок занят другим активным пользователем — отказ.
  if (
    existing &&
    existing.userSessionId !== sessionId &&
    !isStale(existing.lastHeartbeat)
  ) {
    return ok({ locked: false, lockedBy: existing.lockedByUsername });
  }

  // Свободен / мой / протух → захватываем (или перехватываем).
  const now = new Date();
  await prisma.lock.upsert({
    where: { applicantId },
    update: {
      userSessionId: sessionId,
      lockedByUsername: user.username,
      lastHeartbeat: now,
      lockedAt: now,
    },
    create: {
      applicantId,
      userSessionId: sessionId,
      lockedByUsername: user.username,
    },
  });

  return ok({ locked: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const applicantId = parseId((await params).id);
  if (!applicantId) return fail("Некорректный id", 400);

  const sessionId = req.nextUrl.searchParams.get("userSessionId");

  const existing = await prisma.lock.findUnique({ where: { applicantId } });
  // Снимаем только свой лок (или уже отсутствующий — идемпотентно).
  if (existing && (!sessionId || existing.userSessionId === sessionId)) {
    await prisma.lock.delete({ where: { applicantId } });
  }

  return ok({ unlocked: true });
}
