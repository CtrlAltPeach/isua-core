// Seed-скрипт: программы + демо-пользователь + тестовые абитуриенты.
// Запуск: npm run db:seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateTotalScore } from "../src/lib/scoring";

const prisma = new PrismaClient();

// 4 программы (ЗиК удалена).
const PROGRAMS = [
  { name: "ИСД", places: 100 },
  { name: "ТГСВ", places: 80 },
  { name: "ЗиК-КИ", places: 30 },
  { name: "ЗиК-ГК", places: 20 },
];

async function main() {
  // Программы — идемпотентно через upsert по уникальному name.
  for (const p of PROGRAMS) {
    await prisma.program.upsert({
      where: { name: p.name },
      update: { places: p.places },
      create: p,
    });
  }
  console.log(`Программы: ${PROGRAMS.length} шт.`);

  // Демо-пользователь для входа и привязки createdBy.
  const demoEmail = "admin@isua.local";
  const passwordHash = await bcrypt.hash("admin12345", 10);
  const admin = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {},
    create: {
      email: demoEmail,
      username: "admin",
      passwordHash,
    },
  });
  console.log(`Демо-пользователь: ${demoEmail} / admin12345`);

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

function rnd<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rndScore(): number {
  return 40 + Math.floor(Math.random() * 61); // целое 40..100
}
function maybe<T>(value: T, p = 0.8): T | null {
  return Math.random() < p ? value : null;
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
        isPaid: Math.random() < 0.2,
        documentType: rnd(["diploma", "certificate", null] as const) ?? undefined,
        citizenship: rnd(["Россия", "Россия", "Россия", "Беларусь", "Казахстан"] as const),
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
