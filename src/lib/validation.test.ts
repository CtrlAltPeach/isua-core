// Тесты нормализации email (регистронезависимость, D1).
import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  updateProgramSchema,
  createApplicantSchema,
} from "./validation";

describe("email нормализация (регистронезависимый)", () => {
  it("login: email приводится к нижнему регистру и тримится", () => {
    const r = loginSchema.parse({ email: "  Admin@ISUA.Local ", password: "x" });
    expect(r.email).toBe("admin@isua.local");
  });

  it("register: email нормализуется", () => {
    const r = registerSchema.parse({
      email: "User@Example.COM",
      username: "user1",
      password: "password1",
    });
    expect(r.email).toBe("user@example.com");
  });

  it("разный регистр одного email даёт одинаковый результат", () => {
    const a = loginSchema.parse({ email: "Petrov@mail.ru", password: "x" }).email;
    const b = loginSchema.parse({ email: "PETROV@MAIL.RU", password: "x" }).email;
    expect(a).toBe(b);
  });

  it("некорректный email отклоняется", () => {
    expect(loginSchema.safeParse({ email: "не-email", password: "x" }).success).toBe(
      false,
    );
  });
});

describe("programGroupId в схеме программы (итер. 15)", () => {
  const parse = (v: unknown) =>
    updateProgramSchema.parse({ programGroupId: v }).programGroupId;

  it("положительное число остаётся числом", () => {
    expect(parse(3)).toBe(3);
    expect(parse("3")).toBe(3);
  });

  it("пусто/null/0 → null («Без группы»)", () => {
    expect(parse("")).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse(0)).toBeNull();
    expect(parse("0")).toBeNull();
  });

  it("отсутствие ключа → undefined (роут трактует как «не менять группу»)", () => {
    expect(updateProgramSchema.parse({}).programGroupId).toBeUndefined();
  });
});

describe("birthDate в схеме абитуриента (итер. 18)", () => {
  const parse = (birthDate: unknown) =>
    createApplicantSchema.parse({ fullName: "Иванов", programId: 1, birthDate })
      .birthDate;

  it("валидная дата парсится в Date (UTC-полночь)", () => {
    const d = parse("2000-01-15");
    expect(d).toBeInstanceOf(Date);
    expect((d as Date).toISOString().slice(0, 10)).toBe("2000-01-15");
  });

  it("пусто/null → null", () => {
    expect(parse("")).toBeNull();
    expect(parse(null)).toBeNull();
  });

  it("отсутствие ключа → null", () => {
    expect(
      createApplicantSchema.parse({ fullName: "Иванов", programId: 1 })
        .birthDate,
    ).toBeNull();
  });

  it("дата в будущем отклоняется", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect(
      createApplicantSchema.safeParse({
        fullName: "Иванов",
        programId: 1,
        birthDate: future,
      }).success,
    ).toBe(false);
  });

  it("год < 1900 и мусор отклоняются", () => {
    const bad = (birthDate: unknown) =>
      createApplicantSchema.safeParse({
        fullName: "Иванов",
        programId: 1,
        birthDate,
      }).success;
    expect(bad("1899-12-31")).toBe(false);
    expect(bad("не-дата")).toBe(false);
  });
});
