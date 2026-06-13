// Шифрование/расшифровка персональных данных абитуриента на границе БД.
// Шифруемые поля (обратимо, AES-256-GCM, см. lib/crypto.ts):
//   passportSeries, passportNumber, inn, snils.
// Поиск по этим полям не предусмотрен (поиск идёт по ФИО/email/телефону).
import { encrypt, decrypt } from "@/lib/crypto";

// Поля абитуриента, хранящиеся в БД в зашифрованном виде.
export const PII_FIELDS = [
  "passportSeries",
  "passportNumber",
  "inn",
  "snils",
] as const;

export type PiiField = (typeof PII_FIELDS)[number];

/**
 * Возвращает копию объекта, где переданные PII-поля зашифрованы.
 * Применять ПЕРЕД записью в БД (create/update). Поля, которых нет в объекте,
 * не добавляются (важно для частичного update).
 */
export function encryptPii<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = { ...data };
  for (const f of PII_FIELDS) {
    if (f in out) {
      const v = out[f];
      out[f] = typeof v === "string" ? encrypt(v) : (v ?? null);
    }
  }
  return out as T;
}

/**
 * Возвращает копию объекта с расшифрованными PII-полями.
 * Применять ПОСЛЕ чтения из БД, перед отдачей клиенту. Безопасно к legacy
 * (открытым) значениям — они возвращаются как есть.
 */
export function decryptPii<T extends Record<string, unknown>>(
  applicant: T,
): T {
  if (applicant == null) return applicant;
  const out: Record<string, unknown> = { ...applicant };
  for (const f of PII_FIELDS) {
    if (f in out) {
      const v = out[f];
      if (typeof v === "string") out[f] = decrypt(v);
    }
  }
  return out as T;
}

/** Расшифровка списка абитуриентов. */
export function decryptPiiList<T extends Record<string, unknown>>(
  items: T[],
): T[] {
  return items.map((a) => decryptPii(a));
}
