import { describe, it, expect } from "vitest";
import { buildHistoryEntries } from "@/lib/history";

describe("buildHistoryEntries", () => {
  it("логирует только изменившиеся переданные поля", () => {
    const entries = buildHistoryEntries(
      1,
      10,
      { fullName: "Иванов", phone: "111", email: "a@b.c" },
      { fullName: "Петров", phone: "111" }, // email не передан, phone не изменился
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      applicantId: 1,
      changedByUserId: 10,
      fieldName: "fullName",
      oldValue: "Иванов",
      newValue: "Петров",
    });
  });

  it("не логирует поле без изменения значения", () => {
    const entries = buildHistoryEntries(
      1,
      10,
      { status: "applied" },
      { status: "applied" },
    );
    expect(entries).toHaveLength(0);
  });

  it("пропускает поля, отсутствующие в after (не передавались)", () => {
    const entries = buildHistoryEntries(
      1,
      10,
      { fullName: "Иванов", notes: "старое" },
      { fullName: "Иванов" },
    );
    expect(entries).toHaveLength(0);
  });

  it("логирует булевы поля как строки true/false", () => {
    const entries = buildHistoryEntries(
      1,
      10,
      { consentToEnroll: false },
      { consentToEnroll: true },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].oldValue).toBe("false");
    expect(entries[0].newValue).toBe("true");
  });

  it("null ↔ значение фиксируется", () => {
    const entries = buildHistoryEntries(
      1,
      10,
      { phone: null },
      { phone: "999" },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].oldValue).toBeNull();
    expect(entries[0].newValue).toBe("999");
  });

  it("не логирует нелогируемые служебные поля (version/totalScore)", () => {
    const entries = buildHistoryEntries(
      1,
      10,
      { version: 1, totalScore: 100 },
      { version: 2, totalScore: 200 },
    );
    expect(entries).toHaveLength(0);
  });
});
