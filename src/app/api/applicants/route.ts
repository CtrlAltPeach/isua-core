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

// Nullable-поля сортировки: для них указываем NULLS LAST, чтобы при сортировке по
// убыванию (напр. по баллу) прочерки (null) оказывались в конце списка, а не в начале.
const NULLABLE_SORT = new Set(["totalScore"]);

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const sp = req.nextUrl.searchParams;

  const page = Math.max(1, Number(sp.get("page")) || 1);
  // limit отсутствует → 50; "0" → 0 (опция «Все», без skip/take); NaN → 50.
  const limitParam = sp.get("limit");
  const limitRaw = limitParam === null ? 50 : Number(limitParam);
  const limit = limitRaw === 0 ? 0 : Math.min(100, Math.max(1, limitRaw || 50));
  const search = sp.get("search")?.trim();
  const status = sp.get("status") ?? undefined;
  const programId = sp.get("program_id");

  const sortByRaw = sp.get("sort_by") ?? "createdAt";
  const sortBy = SORTABLE.has(sortByRaw) ? sortByRaw : "createdAt";
  const order = sp.get("order") === "asc" ? "asc" : "desc";

  // Чипы-тогглы (итер. 19): boolean-фильтры по маркерам. Параметр = "1" → true.
  const flag = (key: string) => (sp.get(key) === "1" ? true : undefined);

  // Фильтры выполняются на уровне БД (PLAN.md, оптимизация).
  const where: Prisma.ApplicantWhereInput = {};
  if (status && (APPLICANT_STATUSES as readonly string[]).includes(status)) {
    where.status = status as ApplicantStatus;
  }
  if (programId && Number(programId) > 0) {
    where.programId = Number(programId);
  }
  // Boolean-маркеры комбинируются через AND (должны выполняться все активные).
  const specialQuota = flag("ok");
  const specialRight = flag("op");
  const consentToEnroll = flag("consent");
  const documentsComplete = flag("docs");
  const isPaid = flag("paid");
  const isDistant = flag("distant");
  if (specialQuota !== undefined) where.specialQuota = specialQuota;
  if (specialRight !== undefined) where.specialRight = specialRight;
  if (consentToEnroll !== undefined) where.consentToEnroll = consentToEnroll;
  if (documentsComplete !== undefined) where.documentsComplete = documentsComplete;
  if (isPaid !== undefined) where.isPaid = isPaid;
  if (isDistant !== undefined) where.isDistant = isDistant;
  if (search) {
    // Регистронезависимый поиск, в т.ч. по кириллице. БД создана с ICU-локалью
    // ru-RU (12A), поэтому Prisma mode:"insensitive" корректно сворачивает регистр
    // русских букв — raw SQL с COLLATE-костылём больше не нужен.
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
  }

  // NULLS LAST для nullable-полей (напр. totalScore), чтобы при сортировке по
  // убыванию null-значения уходили в конец, а не в начало списка. Тай-брейк по
  // createdAt даёт стабильный вторичный порядок.
  const orderBy: Prisma.ApplicantOrderByWithRelationInput[] = [
    NULLABLE_SORT.has(sortBy)
      ? { [sortBy]: { sort: order, nulls: "last" } }
      : { [sortBy]: order },
    { createdAt: "desc" },
  ];

  const [items, total] = await Promise.all([
    prisma.applicant.findMany({
      where,
      orderBy,
      skip: limit === 0 ? undefined : (page - 1) * limit,
      take: limit === 0 ? undefined : limit,
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
  const viScore = data.viScore ?? null;
  const totalScore = calculateTotalScore(
    { ...data, mathProfile },
    additionalScores,
    viScore,
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
      specialRight: data.specialRight ?? false,
      isPaid: data.isPaid ?? false,
      isDistant: data.isDistant ?? false,
      birthDate: data.birthDate ?? null,
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
      viScore,
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
