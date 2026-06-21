// /api/applicants/[id]
//   GET    — один абитуриент
//   PUT    — обновление (history-лог, total_score, согласие, оптимистичная блокировка)
//   DELETE — удаление
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden, notFound } from "@/lib/http";
import { updateApplicantSchema } from "@/lib/validation";
import { calculateTotalScore, SCORE_FIELDS } from "@/lib/scoring";
import { normalizeConsent } from "@/lib/applicant-logic";
import { buildHistoryEntries } from "@/lib/history";
import { encrypt, decrypt } from "@/lib/crypto";
import { PII_FIELDS, decryptPii } from "@/lib/applicant-pii";
import type { ApplicantStatus } from "@/lib/types";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const id = parseId((await params).id);
  if (!id) return fail("Некорректный id", 400);

  const applicant = await prisma.applicant.findUnique({
    where: { id },
    include: { program: { select: { id: true, name: true } } },
  });
  if (!applicant) return notFound("Абитуриент");

  return ok(decryptPii(applicant));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const id = parseId((await params).id);
  if (!id) return fail("Некорректный id", 400);

  const body = await req.json().catch(() => null);
  const parsed = updateApplicantSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }
  const data = parsed.data;

  const current = await prisma.applicant.findUnique({ where: { id } });
  if (!current) return notFound("Абитуриент");

  // Оптимистичная блокировка: если клиент прислал version и она устарела → 409.
  if (data.version !== undefined && data.version !== current.version) {
    return fail("Данные были изменены другим пользователем", 409);
  }

  // Проверка программы, если меняется.
  if (data.programId !== undefined && data.programId !== current.programId) {
    const program = await prisma.program.findUnique({
      where: { id: data.programId },
      select: { id: true },
    });
    if (!program) return fail("Указанная программа не найдена", 422);
  }

  // Собираем изменения только из переданных полей.
  const { version: _version, status: statusInput, ...rest } = data;
  void _version;
  const updates: Prisma.ApplicantUpdateInput = {};

  // Математика база/профиль взаимоисключающи: если в запросе задана база (не null),
  // профиль принудительно очищаем (и наоборот).
  if ("mathBase" in rest && rest.mathBase != null) {
    (rest as Record<string, unknown>).mathProfile = null;
  } else if ("mathProfile" in rest && rest.mathProfile != null) {
    (rest as Record<string, unknown>).mathBase = null;
  }

  // Простые поля.
  const SIMPLE_FIELDS = [
    "fullName",
    "phone",
    "email",
    "programId",
    "documentsComplete",
    "specialQuota",
    "specialRight",
    "isPaid",
    "isDistant",
    "documentType",
    "citizenship",
    "passportSeries",
    "passportNumber",
    "mathBase",
    "mathProfile",
    "russian",
    "chemistry",
    "physics",
    "informatics",
    "geography",
    "additionalScores",
    "registrationAddress",
    "inn",
    "snils",
    "notes",
  ] as const;

  // Шифруемые ПДн обрабатываем отдельно: в БД — зашифрованное значение,
  // в историю — только маска (факт изменения, без раскрытия значения).
  const PII = new Set<string>(PII_FIELDS);
  const mask = (v: unknown): string | null =>
    v == null || v === "" ? null : "•••";

  const afterForHistory: Record<string, unknown> = {};
  // Записи истории для ПДн (строятся вручную, с маской).
  const piiHistory: {
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
  }[] = [];

  for (const f of SIMPLE_FIELDS) {
    if (f in rest && rest[f] !== undefined) {
      // programId как relation требует особой формы — задаём отдельно ниже.
      if (f === "programId") continue;
      if (PII.has(f)) {
        const raw = rest[f];
        // В БД — зашифрованное значение.
        (updates as Record<string, unknown>)[f] =
          typeof raw === "string" ? encrypt(raw) : (raw ?? null);
        // Детект изменения по РАСШИФРОВАННОМУ старому значению; в журнал — маска.
        const oldPlain = decrypt(current[f as keyof typeof current] as string | null);
        const newPlain = typeof raw === "string" ? (raw === "" ? null : raw) : null;
        if (oldPlain !== newPlain) {
          piiHistory.push({
            fieldName: f,
            oldValue: mask(oldPlain),
            newValue: mask(newPlain),
          });
        }
        // НЕ кладём в afterForHistory — общий механизм пропустит это поле.
      } else {
        (updates as Record<string, unknown>)[f] = rest[f];
        afterForHistory[f] = rest[f];
      }
    }
  }
  if (rest.programId !== undefined) {
    updates.program = { connect: { id: rest.programId } };
    afterForHistory.programId = rest.programId;
  }

  // Статус.
  const nextStatus = (statusInput ?? current.status) as ApplicantStatus;
  if (statusInput !== undefined) {
    updates.status = statusInput;
    afterForHistory.status = statusInput;
  }

  // Пересчёт total_score при изменении любого предметного балла или доп. баллов.
  // ВАЖНО: берём переданное значение, даже если это null (поле очищено),
  // иначе `?? current` ошибочно вернёт старое значение.
  const pick = <K extends keyof typeof current>(k: K) =>
    k in rest ? (rest as Record<string, unknown>)[k as string] : current[k];
  const scoreTouched =
    SCORE_FIELDS.some((f) => f in rest) || "additionalScores" in rest;
  if (scoreTouched) {
    const merged = {
      mathProfile: pick("mathProfile") as number | null,
      russian: pick("russian") as number | null,
      chemistry: pick("chemistry") as number | null,
      physics: pick("physics") as number | null,
      informatics: pick("informatics") as number | null,
      geography: pick("geography") as number | null,
    };
    const extra = pick("additionalScores") as number | null;
    updates.totalScore = calculateTotalScore(merged, extra ?? 0);
  }

  // Согласие: нормализуем по итоговому статусу.
  const requestedConsent =
    rest.consentToEnroll !== undefined
      ? Boolean(rest.consentToEnroll)
      : current.consentToEnroll;
  const finalConsent = normalizeConsent(nextStatus, requestedConsent);
  if (finalConsent !== current.consentToEnroll) {
    updates.consentToEnroll = finalConsent;
    afterForHistory.consentToEnroll = finalConsent;
  }

  // Записи истории по изменившимся логируемым полям (ПДн исключены — см. ниже).
  const historyEntries = buildHistoryEntries(
    id,
    user.id,
    current as unknown as Record<string, unknown>,
    afterForHistory,
  );
  // Добавляем записи по ПДн с маской (значения не раскрываются в журнале).
  for (const h of piiHistory) {
    historyEntries.push({
      applicantId: id,
      changedByUserId: user.id,
      fieldName: h.fieldName,
      oldValue: h.oldValue,
      newValue: h.newValue,
    });
  }

  // Инкремент version при любом изменении.
  updates.version = { increment: 1 };

  // Транзакция: обновление + лог истории.
  const [updated] = await prisma.$transaction([
    prisma.applicant.update({
      where: { id },
      data: updates,
      include: { program: { select: { id: true, name: true } } },
    }),
    prisma.history.createMany({ data: historyEntries }),
  ]);

  return ok(decryptPii(updated));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Удаление абитуриента — только админ (operator может создавать/редактировать).
  const admin = await requireAdmin(req);
  if (!admin) return forbidden();

  const id = parseId((await params).id);
  if (!id) return fail("Некорректный id", 400);

  const existing = await prisma.applicant.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return notFound("Абитуриент");

  // History и Lock удалятся каскадно (onDelete: Cascade).
  await prisma.applicant.delete({ where: { id } });
  return ok({ success: true });
}
