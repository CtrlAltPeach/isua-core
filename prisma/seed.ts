// Seed-скрипт.
//
// СИДИНГ ОТКЛЮЧЁН по умолчанию (по решению пользователя 2026-06-18): БД должна
// заполняться вручную через интерфейс, без авто-генерации тестовых данных.
// `npm run db:seed` / `prisma migrate reset` ничего не создают.
//
// Чтобы временно вернуть тестовые данные — запустить с флагом:
//   SEED_DATA=1 npm run db:seed
// тогда создаются 4 программы, демо-админ (admin@isua.local) и 60 абитуриентов.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateTotalScore } from "../src/lib/scoring";
import { encrypt } from "../src/lib/crypto";

const prisma = new PrismaClient();

// Группы программ (демо). Используются только при SEED_DATA=1.
const GROUPS = [
  { name: "Инженерные", sortOrder: 1 },
  { name: "Землеустройство", sortOrder: 2 },
];

// 4 программы (ЗиК удалена). Используются только при SEED_DATA=1.
// group — имя группы из GROUPS (или null для «Без группы»).
const PROGRAMS = [
  { name: "ИСД", places: 100, group: "Инженерные" },
  { name: "ТГСВ", places: 80, group: "Инженерные" },
  { name: "ЗиК-КИ", places: 30, group: "Землеустройство" },
  { name: "ЗиК-ГК", places: 20, group: "Землеустройство" },
];

async function main() {
  // Сидинг включается только явным флагом SEED_DATA=1. Иначе — ничего не делаем.
  if (process.env.SEED_DATA !== "1") {
    console.log(
      "Сидинг отключён. Данные заводятся вручную через интерфейс.\n" +
        "Первого админа создайте через /register (bootstrap на пустой БД).\n" +
        "Чтобы засеять тестовые данные: SEED_DATA=1 npm run db:seed",
    );
    return;
  }

  // Группы программ — идемпотентно через upsert по уникальному name.
  const groupIdByName = new Map<string, number>();
  for (const g of GROUPS) {
    const group = await prisma.programGroup.upsert({
      where: { name: g.name },
      update: { sortOrder: g.sortOrder },
      create: g,
    });
    groupIdByName.set(g.name, group.id);
  }
  console.log(`Группы программ: ${GROUPS.length} шт.`);

  // Программы — идемпотентно через upsert по уникальному name.
  for (const p of PROGRAMS) {
    const programGroupId = p.group ? (groupIdByName.get(p.group) ?? null) : null;
    await prisma.program.upsert({
      where: { name: p.name },
      update: { places: p.places, programGroupId },
      create: { name: p.name, places: p.places, programGroupId },
    });
  }
  console.log(`Программы: ${PROGRAMS.length} шт.`);

  // Демо-админ: пароль из SEED_ADMIN_PASSWORD, иначе дефолт admin12345 (dev).
  const demoEmail = "admin@isua.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.upsert({
    where: { email: demoEmail },
    update: { role: "admin" },
    create: {
      email: demoEmail,
      username: "admin",
      passwordHash,
      role: "admin",
    },
  });
  console.log(
    `Админ: ${demoEmail}` +
      (process.env.SEED_ADMIN_PASSWORD ? "" : " / admin12345 (dev)"),
  );

  // Тестовые абитуриенты (только если их ещё нет).
  const existing = await prisma.applicant.count();
  if (existing === 0) {
    await seedApplicants(admin.id);
  } else {
    console.log(`Абитуриенты уже есть (${existing}), пропускаю генерацию.`);
  }
}

// --- Генерация тестовых абитуриентов ---
const LAST_M = ["Иванов", "Петров", "Сидоров", "Смирнов", "Кузнецов", "Попов", "Соколов", "Лебедев", "Козлов", "Новиков", "Морозов", "Волков", "Алексеев", "Егоров", "Павлов"];
const FIRST_M = ["Иван", "Пётр", "Алексей", "Дмитрий", "Сергей", "Андрей", "Максим", "Никита", "Артём", "Михаил"];
const MID_M = ["Иванович", "Петрович", "Алексеевич", "Дмитриевич", "Сергеевич", "Андреевич"];
const FIRST_F = ["Анна", "Мария", "Елена", "Ольга", "Наталья", "Екатерина", "Дарья", "Юлия", "Татьяна", "Софья"];
const MID_F = ["Ивановна", "Петровна", "Алексеевна", "Дмитриевна", "Сергеевна", "Андреевна"];
const STATUSES = ["applied", "withdrawn"] as const;
const NOTES = ["Льготник", "Олимпиадник", "Целевое", "Перевод из другого вуза", null, null, null];

const CITIES = ["г. Москва", "г. Санкт-Петербург", "г. Казань", "г. Екатеринбург", "г. Новосибирск"];
const STREETS = ["ул. Ленина", "ул. Гагарина", "пр. Мира", "ул. Советская", "ул. Школьная"];

function rnd<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rndScore(): number {
  return 40 + Math.floor(Math.random() * 61); // целое 40..100
}
function maybe<T>(value: T, p = 0.8): T | null {
  return Math.random() < p ? value : null;
}
function rndDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}
function rndSnils(): string {
  // Формат XXX-XXX-XXX YY (без контрольной суммы — тестовые данные).
  return `${rndDigits(3)}-${rndDigits(3)}-${rndDigits(3)} ${rndDigits(2)}`;
}
function rndAddress(): string {
  return `${rnd(CITIES)}, ${rnd(STREETS)}, д. ${1 + Math.floor(Math.random() * 80)}, кв. ${1 + Math.floor(Math.random() * 200)}`;
}
// Шифрование ПДн для seed (как делает API через encryptPii). Хранить открыто нельзя.
function encPii(v: string | null): string | null {
  return v == null ? null : encrypt(v);
}

async function seedApplicants(createdByUserId: number) {
  const programs = await prisma.program.findMany({ select: { id: true } });
  const COUNT = 60;
  let created = 0;

  for (let i = 0; i < COUNT; i++) {
    const female = Math.random() < 0.5;
    const last = rnd(LAST_M) + (female ? "а" : "");
    const fullName = female
      ? `${last} ${rnd(FIRST_F)} ${rnd(MID_F)}`
      : `${last} ${rnd(FIRST_M)} ${rnd(MID_M)}`;

    const status = rnd(STATUSES);
    // Математика: ЛИБО база, ЛИБО профиль (взаимоисключающи).
    const takesBase = Math.random() < 0.4;
    const mathBase = takesBase ? 2 + Math.floor(Math.random() * 4) : null; // 2..5
    const scores = {
      mathProfile: takesBase ? null : maybe(rndScore(), 0.9),
      russian: maybe(rndScore(), 0.95),
      chemistry: maybe(rndScore(), 0.4),
      physics: maybe(rndScore(), 0.5),
      informatics: maybe(rndScore(), 0.5),
      geography: maybe(rndScore(), 0.2),
    };
    const additionalScores = Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 10) : 0;
    // Балл: сумма топ-3 предметов + доп. баллы (mathBase не входит).
    const totalScore = calculateTotalScore(scores, additionalScores);

    // Согласие — у части подавших; забравшие — всегда false.
    const consent = status === "applied" && Math.random() < 0.5;

    // Паспорт: серия и номер заполняются вместе (либо оба, либо ни одного).
    const hasPassport = Math.random() < 0.75;
    const passportSeries = hasPassport ? rndDigits(4) : null;
    const passportNumber = hasPassport ? rndDigits(6) : null;

    await prisma.applicant.create({
      data: {
        fullName,
        programId: rnd(programs).id,
        status,
        phone: maybe(`+7900${String(1000000 + i).slice(-7)}`, 0.7) ?? undefined,
        email: maybe(`abit${i}@example.com`, 0.6) ?? undefined,
        consentToEnroll: consent,
        documentsComplete: Math.random() < 0.6,
        specialQuota: Math.random() < 0.15,
        specialRight: Math.random() < 0.12,
        isPaid: Math.random() < 0.2,
        isDistant: Math.random() < 0.25,
        documentType: rnd(["diploma", "certificate", null] as const) ?? undefined,
        citizenship: rnd(["Россия", "Россия", "Россия", "Беларусь", "Казахстан"] as const),
        // Персональные данные (паспорт/ИНН/СНИЛС) — ЗАШИФРОВАННЫЕ (как в API).
        passportSeries: encPii(passportSeries) ?? undefined,
        passportNumber: encPii(passportNumber) ?? undefined,
        inn: encPii(maybe(rndDigits(12), 0.5)) ?? undefined,
        snils: encPii(maybe(rndSnils(), 0.5)) ?? undefined,
        registrationAddress: maybe(rndAddress(), 0.6) ?? undefined,
        mathBase: mathBase ?? undefined,
        ...scores,
        additionalScores,
        totalScore,
        notes: rnd(NOTES) ?? undefined,
        createdByUserId,
      },
    });
    created++;
  }
  console.log(`Тестовые абитуриенты: ${created} шт.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
