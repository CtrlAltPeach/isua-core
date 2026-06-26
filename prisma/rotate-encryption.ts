// Ре-шифрование ПДн абитуриентов текущим ключом ENCRYPTION_KEY (ротация ключа).
//
// Когда запускать: при смене ключа шифрования. В окружении должны быть ОБА ключа:
//   ENCRYPTION_KEY     — НОВЫЙ ключ (им всё перешифровывается),
//   ENCRYPTION_KEY_OLD — СТАРЫЙ ключ, которым данные зашифрованы сейчас
//                        (можно несколько через запятую).
// Для каждого PII-поля: decrypt (keyring новый/старый) → encrypt (новый) → update.
//
// Свойства:
//   • идемпотентно — значения, уже под текущим ключом, пропускаются;
//   • безопасно — поле, которое не расшифровал НИ ОДИН ключ, не трогается;
//   • батчами (keyset-пагинация по id), с логом счётчиков.
//
// Запуск:
//   npm run crypto:rotate               — выполнить ротацию
//   npm run crypto:rotate -- --dry-run  — только показать, что изменится (без записи)
//
// Полный runbook ротации — .ai/SECURITY.md, раздел «Ротация ключа шифрования».
import { PrismaClient } from "@prisma/client";
import {
  decrypt,
  encrypt,
  isEncrypted,
  isUnderCurrentKey,
} from "../src/lib/crypto";
import { PII_FIELDS } from "../src/lib/applicant-pii";

const prisma = new PrismaClient();
const BATCH = 200;
const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY не задан — нечем шифровать. Прервано.");
  }
  if (dryRun) console.log("РЕЖИМ DRY-RUN: изменения НЕ записываются.\n");

  let applicants = 0; // обработано абитуриентов
  let reencrypted = 0; // полей перешифровано (или будет — в dry-run)
  let already = 0; // полей уже под текущим ключом (пропущено)
  let empty = 0; // полей пусто/null (пропущено)
  let failed = 0; // полей не расшифровал ни один ключ (НЕ тронуто)
  let lastId = 0;

  // Keyset-пагинация по id: устойчива к апдейтам во время прохода.
  for (;;) {
    const batch = await prisma.applicant.findMany({
      where: { id: { gt: lastId } },
      orderBy: { id: "asc" },
      take: BATCH,
      select: {
        id: true,
        passportSeries: true,
        passportNumber: true,
        inn: true,
        snils: true,
      },
    });
    if (batch.length === 0) break;

    for (const a of batch) {
      lastId = a.id;
      applicants++;
      const data: Record<string, string | null> = {};
      for (const f of PII_FIELDS) {
        const stored = a[f];
        if (stored == null || stored === "") {
          empty++;
          continue;
        }
        if (isEncrypted(stored) && isUnderCurrentKey(stored)) {
          already++; // уже под текущим ключом — идемпотентность
          continue;
        }
        // legacy-открытое (без префикса) ИЛИ зашифровано старым ключом.
        const plain = isEncrypted(stored) ? decrypt(stored) : stored;
        if (plain === null) {
          failed++;
          console.warn(
            `  ⚠ applicant#${a.id}.${f}: не расшифровать (нет подходящего ключа) — пропуск`,
          );
          continue;
        }
        data[f] = encrypt(plain);
        reencrypted++;
      }
      if (!dryRun && Object.keys(data).length > 0) {
        await prisma.applicant.update({ where: { id: a.id }, data });
      }
    }
    console.log(
      `… абитуриентов: ${applicants}, полей к перешифровке: ${reencrypted}`,
    );
  }

  console.log(`\n${dryRun ? "DRY-RUN итог" : "Готово"}:`);
  console.log(`  абитуриентов обработано:      ${applicants}`);
  console.log(
    `  полей ${dryRun ? "будет перешифровано" : "перешифровано"}: ${reencrypted}`,
  );
  console.log(`  полей уже под текущим ключом:  ${already}`);
  console.log(`  полей пусто:                   ${empty}`);
  if (failed > 0) {
    console.log(
      `  ⚠ полей НЕ расшифровано:       ${failed} (проверьте ENCRYPTION_KEY_OLD)`,
    );
    if (!dryRun) process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("Ошибка ротации:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
