// Обратимое шифрование чувствительных персональных данных (паспорт, ИНН, СНИЛС).
// AES-256-GCM через node:crypto. Только на сервере (route handlers, скрипты).
//
// Формат зашифрованной строки: "enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>".
// Префикс "enc:v1:" позволяет отличать зашифрованные значения от старых
// открытых (для плавной миграции и идемпотентности).
//
// Ключ берётся из ENCRYPTION_KEY (32 байта в hex (64 симв.) или base64).
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";
const IV_LEN = 12; // рекомендуемая длина IV для GCM

// Ленивая загрузка ключа: не падаем при импорте, только при реальном
// шифровании/расшифровке. Это позволяет проекту собираться без ключа,
// но при работе с ПДн ключ обязателен.
let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY не задан в окружении — шифрование персональных данных невозможно",
    );
  }
  let key: Buffer;
  // hex (64 символа) или base64.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY должен быть 32 байта (256 бит); получено ${key.length}`,
    );
  }
  cachedKey = key;
  return key;
}

/** Уже зашифровано нашим форматом? */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * Шифрует строку. null/undefined/"" возвращаются как есть (нечего шифровать).
 * Уже зашифрованное значение возвращается без повторного шифрования (идемпотентно).
 */
export function encrypt(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return value === undefined ? null : value;
  }
  if (isEncrypted(value)) return value;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, loadKey(), iv);
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

/**
 * Расшифровывает строку. null/"" → как есть. Значение без нашего префикса
 * считается старым открытым (legacy) и возвращается без изменений — это
 * обеспечивает работу до миграции существующих данных.
 */
export function decrypt(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return value === undefined ? null : value;
  }
  if (!isEncrypted(value)) return value; // legacy-открытое значение
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return value; // не наш формат — не трогаем
  const [ivB64, tagB64, dataB64] = parts;
  try {
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = createDecipheriv(ALGO, loadKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    // Повреждённое значение или неверный ключ — не валим запрос целиком.
    return null;
  }
}
