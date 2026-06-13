// Одноразовая миграция: шифрует существующие открытые ПДн абитуриентов
// (passportSeries, passportNumber, inn, snils) в БД.
// Идемпотентно: уже зашифрованные значения (префикс enc:v1:) пропускаются.
//
// Запуск: npx tsx prisma/encrypt-pii.ts
import { PrismaClient } from "@prisma/client";
import { encrypt, isEncrypted } from "../src/lib/crypto";

const prisma = new PrismaClient();
const FIELDS = ["passportSeries", "passportNumber", "inn", "snils"] as const;

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY не задан — нечем шифровать");
  }
  const all = await prisma.applicant.findMany({
    select: {
      id: true,
      passportSeries: true,
      passportNumber: true,
      inn: true,
      snils: true,
    },
  });

  let touched = 0;
  for (const a of all) {
    const data: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = a[f];
      if (typeof v === "string" && v !== "" && !isEncrypted(v)) {
        const enc = encrypt(v);
        if (enc) data[f] = enc;
      }
    }
    if (Object.keys(data).length > 0) {
      await prisma.applicant.update({ where: { id: a.id }, data });
      touched++;
    }
  }
  console.log(
    `Готово. Обработано записей: ${all.length}, зашифровано (изменено): ${touched}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
