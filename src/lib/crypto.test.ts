import { describe, it, expect, beforeAll } from "vitest";

// Ключ для тестов задаётся ДО импорта модуля (loadKey ленивый, читает env).
beforeAll(() => {
  process.env.ENCRYPTION_KEY =
    "0000000000000000000000000000000000000000000000000000000000000001";
});

// Динамический импорт после установки env.
const { encrypt, decrypt, isEncrypted } = await import("@/lib/crypto");

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
