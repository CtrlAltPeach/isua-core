// Обратимое шифрование чувствительных персональных данных (паспорт, ИНН, СНИЛС).
// AES-256-GCM через node:crypto. Только на сервере (route handlers, скрипты).
//
// Формат зашифрованной строки: "enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>".
// Префикс "enc:v1:" позволяет отличать зашифрованные значения от старых
// открытых (для плавной миграции и идемпотентности).
//
// Ротация ключа (keyring):
//   ENCRYPTION_KEY     — ТЕКУЩИЙ ключ; им шифруются новые значения (encrypt).
//   ENCRYPTION_KEY_OLD — прежний ключ или несколько (через запятую) на время
//                        ротации. decrypt пробует текущий, затем по очереди
//                        старые: auth-tag GCM однозначно выявляет верный ключ.
//                        После ре-шифрования всех данных (npm run crypto:rotate)
//                        ENCRYPTION_KEY_OLD убирают. Формат остаётся enc:v1
//                        (trial-decrypt не требует смены формата).
//
// Ключ — 32 байта (256 бит) в hex (64 симв.) или base64.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";
const IV_LEN = 12; // рекомендуемая длина IV для GCM

// Ленивая загрузка ключей: не падаем при импорте, только при реальном
// шифровании/расшифровке. Проект собирается без ключа, но при работе с ПДн
// текущий ключ обязателен.
let cachedCurrent: Buffer | null = null;
let cachedOld: Buffer[] | null = null;

// Парсит ключ из hex(64) или base64; проверяет длину 32 байта.
function parseKey(raw: string, label: string): Buffer {
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `${label} должен быть 32 байта (256 бит); получено ${key.length}`,
    );
  }
  return key;
}

// Текущий ключ (ENCRYPTION_KEY) — обязателен для encrypt и первичного decrypt.
function currentKey(): Buffer {
  if (cachedCurrent) return cachedCurrent;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY не задан в окружении — шифрование персональных данных невозможно",
    );
  }
  cachedCurrent = parseKey(raw, "ENCRYPTION_KEY");
  return cachedCurrent;
}

// Старые ключи (ENCRYPTION_KEY_OLD, через запятую) — пробуются при ротации.
// Отсутствие переменной = пустой список (обычный режим без ротации).
function oldKeys(): Buffer[] {
  if (cachedOld) return cachedOld;
  const raw = process.env.ENCRYPTION_KEY_OLD;
  cachedOld = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s, i) => parseKey(s, `ENCRYPTION_KEY_OLD[${i}]`))
    : [];
  return cachedOld;
}

/**
 * Сбрасывает кеш ключей (после смены ENCRYPTION_KEY* в process.env).
 * Нужен тестам и долгоживущим процессам, которым подменили окружение;
 * в обычном рантайме не вызывается.
 */
export function resetKeyCache(): void {
  cachedCurrent = null;
  cachedOld = null;
}

/** Уже зашифровано нашим форматом? */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * Шифрует строку текущим ключом. null/undefined/"" возвращаются как есть
 * (нечего шифровать). Уже зашифрованное значение возвращается без повторного
 * шифрования (идемпотентно).
 */
export function encrypt(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return value === undefined ? null : value;
  }
  if (isEncrypted(value)) return value;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, currentKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    iv.toString("base64") +
    ":" +
    tag.toString("base64") +
    ":" +
    ciphertext.toString("base64")
  );
}

// Разбирает "enc:v1:iv:tag:ct" в буферы. null, если формат не наш/битый.
function parseParts(
  value: string,
): { iv: Buffer; tag: Buffer; data: Buffer } | null {
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  const [ivB64, tagB64, dataB64] = parts;
  return {
    iv: Buffer.from(ivB64, "base64"),
    tag: Buffer.from(tagB64, "base64"),
    data: Buffer.from(dataB64, "base64"),
  };
}

// Пробует расшифровать одним ключом; неверный ключ/повреждение → null.
function tryDecrypt(
  key: Buffer,
  iv: Buffer,
  tag: Buffer,
  data: Buffer,
): string | null {
  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Расшифровывает строку. null/"" → как есть. Значение без нашего префикса
 * считается старым открытым (legacy) и возвращается без изменений — это
 * обеспечивает работу до миграции существующих данных.
 *
 * Пробует текущий ключ, затем (при ротации) старые из ENCRYPTION_KEY_OLD.
 * Повреждённое значение или ни один не подошедший ключ → null.
 */
export function decrypt(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return value === undefined ? null : value;
  }
  if (!isEncrypted(value)) return value; // legacy-открытое значение
  const parsed = parseParts(value);
  if (!parsed) return value; // не наш формат — не трогаем
  const { iv, tag, data } = parsed;
  // Текущий ключ — первым; auth-tag GCM выявит верный среди старых.
  for (const key of [currentKey(), ...oldKeys()]) {
    const plain = tryDecrypt(key, iv, tag, data);
    if (plain !== null) return plain;
  }
  return null;
}

/**
 * Зашифровано ли значение ТЕКУЩИМ ключом (ENCRYPTION_KEY)? Старые ключи
 * игнорируются. Используется ротацией для идемпотентности: значения, уже
 * перешифрованные текущим ключом, повторно не трогаются. Для legacy-открытых
 * и не-наших значений — false.
 */
export function isUnderCurrentKey(value: string): boolean {
  if (!isEncrypted(value)) return false;
  const parsed = parseParts(value);
  if (!parsed) return false;
  return tryDecrypt(currentKey(), parsed.iv, parsed.tag, parsed.data) !== null;
}
