// /api/applicants
//   GET  — список с фильтрами/поиском/сортировкой/пагинацией
//   POST — создание абитуриента
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import { createApplicantSchema, APPLICANT_STATUSES } from "@/lib/validation";
import { calculateTotalScore } from "@/lib/scoring";
import { normalizeConsent } from "@/lib/applicant-logic";
import { encryptPii, decryptPii, decryptPiiList } from "@/lib/applicant-pii";
import type { ApplicantStatus } from "@/lib/types";

// Разрешённые поля сортировки (защита от инъекции имени колонки).
const SORTABLE = new Set([
  "createdAt",
  "fullName",
  "status",
  "totalScore",
  "programId",
]);

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const sp = req.nextUrl.searchParams;

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50));
  const search = sp.get("search")?.trim();
  const status = sp.get("status") ?? undefined;
  const programId = sp.get("program_id");

  const sortByRaw = sp.get("sort_by") ?? "createdAt";
  const sortBy = SORTABLE.has(sortByRaw) ? sortByRaw : "createdAt";
  const order = sp.get("order") === "asc" ? "asc" : "desc";

  // Фильтры выполняются на уровне БД (PLAN.md, оптимизация).
  const where: Prisma.ApplicantWhereInput = {};
  if (status && (APPLICANT_STATUSES as readonly string[]).includes(status)) {
    where.status = status as ApplicantStatus;
  }
  if (programId && Number(programId) > 0) {
    where.programId = Number(programId);
  }
  if (search) {
    // Регистронезависимый поиск по кириллице: lower() с ICU-collation
    // (default-collation БД = C, поэтому ILIKE не сворачивает регистр русских букв).
    // Сначала находим id через raw SQL, затем фильтруем обычным Prisma-where —
    // так сохраняются сортировка/пагинация/include.
    const pattern = `%${search.toLowerCase()}%`;
    const rows = await prisma.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "Applicant"
      WHERE lower("fullName" COLLATE "und-x-icu") LIKE ${pattern}
         OR lower(coalesce("email", '') COLLATE "und-x-icu") LIKE ${pattern}
         OR lower(coalesce("phone", '')) LIKE ${pattern}
    `;
    where.id = { in: rows.map((r) => r.id) };
  }

  const [items, total] = await Promise.all([
    prisma.applicant.findMany({
      where,
      orderBy: { [sortBy]: order },
      skip: (page - 1) * limit,
      take: limit,
      include: { program: { select: { id: true, name: true } } },
    }),
    prisma.applicant.count({ where }),
  ]);

  return ok({ items: decryptPiiList(items), total, page, limit });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createApplicantSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }
  const data = parsed.data;

  // Программа должна существовать.
  const program = await prisma.program.findUnique({
    where: { id: data.programId },
    select: { id: true },
  });
  if (!program) return fail("Указанная программа не найдена", 422);

  const status = (data.status ?? "applied") as ApplicantStatus;
  // Математика база и профиль взаимоисключающи: если задана база, профиль обнуляем.
  const mathBase = data.mathBase ?? null;
  const mathProfile = mathBase != null ? null : (data.mathProfile ?? null);
  const additionalScores = data.additionalScores ?? 0;
  const totalScore = calculateTotalScore(
    { ...data, mathProfile },
    additionalScores,
  );
  const consent = normalizeConsent(status, data.consentToEnroll ?? false);

  // Шифруем персональные данные (паспорт/ИНН/СНИЛС) перед записью.
  const pii = encryptPii({
    passportSeries: data.passportSeries,
    passportNumber: data.passportNumber,
    inn: data.inn,
    snils: data.snils,
  });

  const created = await prisma.applicant.create({
    data: {
      fullName: data.fullName,
      programId: data.programId,
      status,
      phone: data.phone,
      email: data.email,
      consentToEnroll: consent,
      documentsComplete: data.documentsComplete ?? false,
      specialQuota: data.specialQuota ?? false,
      isPaid: data.isPaid ?? false,
      documentType: data.documentType ?? null,
      citizenship: data.citizenship,
      passportSeries: pii.passportSeries,
      passportNumber: pii.passportNumber,
      mathBase,
      mathProfile,
      russian: data.russian,
      chemistry: data.chemistry,
      physics: data.physics,
      informatics: data.informatics,
      geography: data.geography,
      additionalScores,
      totalScore,
      registrationAddress: data.registrationAddress,
      inn: pii.inn,
      snils: pii.snils,
      notes: data.notes,
      createdByUserId: user.id,
    },
    include: { program: { select: { id: true, name: true } } },
  });

  // Возвращаем расшифрованным, чтобы клиент видел введённые значения.
  return ok(decryptPii(created), 201);
}
