import { describe, it, expect, beforeAll, afterEach } from "vitest";

// Базовый ключ для основного набора. Задаётся ДО первого вызова (loadKey
// ленивый, читает env). Ротационные тесты ниже подменяют ключи сами.
const BASE_KEY =
  "0000000000000000000000000000000000000000000000000000000000000001";
beforeAll(() => {
  process.env.ENCRYPTION_KEY = BASE_KEY;
});

// Динамический импорт после установки env.
const { encrypt, decrypt, isEncrypted, isUnderCurrentKey, resetKeyCache } =
  await import("@/lib/crypto");

describe("crypto (AES-256-GCM)", () => {
  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const v = "4509 123456";
    const enc = encrypt(v)!;
    expect(isEncrypted(enc)).toBe(true);
    expect(decrypt(enc)).toBe(v);
  });

  it("формат enc:v1:", () => {
    expect(encrypt("test")!.startsWith("enc:v1:")).toBe(true);
  });

  it("шифртекст отличается от исходного и не содержит его", () => {
    const enc = encrypt("СЕКРЕТ-123")!;
    expect(enc).not.toContain("СЕКРЕТ-123");
    expect(enc).not.toBe("СЕКРЕТ-123");
  });

  it("разные IV → разный шифртекст для одного значения", () => {
    expect(encrypt("одинаково")).not.toBe(encrypt("одинаково"));
  });

  it("идемпотентность: encrypt уже зашифрованного не меняет его", () => {
    const once = encrypt("x")!;
    expect(encrypt(once)).toBe(once);
  });

  it("null/undefined/'' безопасны", () => {
    expect(encrypt(null)).toBeNull();
    expect(encrypt(undefined)).toBeNull();
    expect(encrypt("")).toBe("");
    expect(decrypt(null)).toBeNull();
    expect(decrypt("")).toBe("");
  });

  it("legacy (открытое значение без префикса) проходит насквозь при decrypt", () => {
    expect(decrypt("открытый_текст")).toBe("открытый_текст");
  });

  it("повреждённый шифртекст → null (не throw)", () => {
    expect(decrypt("enc:v1:bad:bad:bad")).toBeNull();
  });

  it("кириллица и юникод сохраняются", () => {
    const v = "Иванов Пётр — №42 ✓";
    expect(decrypt(encrypt(v)!)).toBe(v);
  });
});

describe("crypto: ротация ключа (keyring)", () => {
  const KEY_OLD =
    "1111111111111111111111111111111111111111111111111111111111111111";
  const KEY_NEW =
    "2222222222222222222222222222222222222222222222222222222222222222";
  const KEY_THIRD =
    "3333333333333333333333333333333333333333333333333333333333333333";

  // Подменить активный набор ключей и сбросить кеш.
  function useKeys(current: string, old?: string) {
    process.env.ENCRYPTION_KEY = current;
    if (old === undefined) delete process.env.ENCRYPTION_KEY_OLD;
    else process.env.ENCRYPTION_KEY_OLD = old;
    resetKeyCache();
  }

  // Вернуть базовый ключ, чтобы не влиять на другие наборы тестов.
  afterEach(() => {
    process.env.ENCRYPTION_KEY = BASE_KEY;
    delete process.env.ENCRYPTION_KEY_OLD;
    resetKeyCache();
  });

  it("старый ключ в keyring расшифровывает зашифрованное им значение", () => {
    useKeys(KEY_OLD);
    const enc = encrypt("4509 123456")!;
    useKeys(KEY_NEW, KEY_OLD); // ротация: новый — текущий, старый — в OLD
    expect(decrypt(enc)).toBe("4509 123456");
  });

  it("ни текущий, ни старый ключ не подходят → null", () => {
    useKeys(KEY_OLD);
    const enc = encrypt("секрет")!;
    useKeys(KEY_NEW); // старого нет в keyring
    expect(decrypt(enc)).toBeNull();
  });

  it("ре-шифрование делает значение читаемым только новым ключом", () => {
    useKeys(KEY_OLD);
    const oldCipher = encrypt("СНИЛС-123")!;
    // Ротация: keyring (новый+старый) расшифровывает → шифруем новым.
    useKeys(KEY_NEW, KEY_OLD);
    const plain = decrypt(oldCipher)!;
    expect(plain).toBe("СНИЛС-123");
    const newCipher = encrypt(plain)!;
    expect(newCipher).not.toBe(oldCipher);
    // OLD убран: новым ключом значение читается, старый шифр — уже нет.
    useKeys(KEY_NEW);
    expect(decrypt(newCipher)).toBe("СНИЛС-123");
    expect(decrypt(oldCipher)).toBeNull();
  });

  it("несколько старых ключей через запятую — пробуются все", () => {
    useKeys(KEY_OLD);
    const c1 = encrypt("один")!;
    useKeys(KEY_THIRD);
    const c3 = encrypt("три")!;
    useKeys(KEY_NEW, `${KEY_OLD},${KEY_THIRD}`);
    expect(decrypt(c1)).toBe("один");
    expect(decrypt(c3)).toBe("три");
  });

  it("isUnderCurrentKey: true только для текущего ключа", () => {
    useKeys(KEY_OLD);
    const oldCipher = encrypt("x")!;
    useKeys(KEY_NEW, KEY_OLD);
    expect(isUnderCurrentKey(oldCipher)).toBe(false); // зашифровано старым
    const newCipher = encrypt("x")!;
    expect(isUnderCurrentKey(newCipher)).toBe(true); // зашифровано текущим
    expect(isUnderCurrentKey("открытый_текст")).toBe(false); // legacy
  });
});
