// POST /api/applicants/bulk-delete — массовое удаление по списку id.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, forbidden } from "@/lib/http";
import { bulkDeleteSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  // Массовое удаление — только админ.
  const admin = await requireAdmin(req);
  if (!admin) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = bulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }

  // History и Lock удалятся каскадно (onDelete: Cascade).
  const result = await prisma.applicant.deleteMany({
    where: { id: { in: parsed.data.ids } },
  });

  return ok({ deleted: result.count });
}
