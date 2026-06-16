// POST /api/auth/logout — выход.
// Инкрементит User.tokenVersion → отзывает ВСЕ ранее выданные токены юзера
// (H2: украденный/старый токен перестаёт работать после logout). Затем чистит cookie.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, clearAuthCookie } from "@/lib/auth";
import { ok } from "@/lib/http";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
  }
  await clearAuthCookie();
  return ok({ success: true });
}
