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

  const [entries, total, applicant] = await Promise.all([
    prisma.history.findMany({
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
    }),
    prisma.history.count({ where: { applicantId } }),
    prisma.applicant.findUnique({
      where: { id: applicantId },
      select: {
        createdAt: true,
        createdBy: { select: { id: true, username: true, email: true } },
      },
    }),
  ]);

  // Событие «создание записи» — самое старое в истории. Не храним отдельной
  // строкой: берём создателя (createdByUserId) и дату прямо у абитуриента,
  // поэтому работает и для записей, заведённых до этой логики. Показываем на
  // последней (старейшей) странице, после самой ранней реальной правки.
  const result: unknown[] = [...entries];
  if (applicant && offset + entries.length >= total) {
    result.push({
      id: 0, // синтетическая запись (реальные id > 0)
      fieldName: "created",
      oldValue: null,
      newValue: null,
      changedAt: applicant.createdAt,
      changedBy: applicant.createdBy,
    });
  }

  return ok(result);
}
