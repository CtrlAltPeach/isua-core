import { describe, it, expect } from "vitest";
import { calculateTotalScore } from "@/lib/scoring";

describe("calculateTotalScore", () => {
  it("сумма трёх лучших предметов (ровно 3)", () => {
    expect(
      calculateTotalScore({ russian: 80, physics: 70, informatics: 60 }),
    ).toBe(210);
  });

  it("берёт ТОП-3 при большем числе предметов", () => {
    expect(
      calculateTotalScore({
        russian: 90,
        physics: 80,
        informatics: 70,
        chemistry: 50, // не входит — четвёртый по величине
        geography: 40,
      }),
    ).toBe(240); // 90+80+70
  });

  it("null при меньше 3 предметов", () => {
    expect(calculateTotalScore({ russian: 90, physics: 80 })).toBeNull();
    expect(calculateTotalScore({})).toBeNull();
  });

  it("mathBase НЕ участвует (его нет в ScoreInput)", () => {
    // mathProfile входит, mathBase — нет (по типу его не передать)
    expect(
      calculateTotalScore({ mathProfile: 100, russian: 100, physics: 100 }),
    ).toBe(300);
  });

  it("доп. баллы прибавляются к сумме топ-3", () => {
    expect(
      calculateTotalScore({ russian: 100, physics: 100, informatics: 100 }, 25),
    ).toBe(325); // переполнение >300 допустимо
  });

  it("доп. баллы без 3 предметов НЕ дают балл (null)", () => {
    expect(calculateTotalScore({ russian: 100 }, 50)).toBeNull();
  });

  it("игнорирует null/undefined/NaN в предметах", () => {
    expect(
      calculateTotalScore({
        russian: 80,
        physics: null,
        chemistry: undefined,
        informatics: 70,
        geography: 60,
      }),
    ).toBe(210); // 80+70+60
  });

  it("additionalScores null/undefined трактуется как 0", () => {
    const base = { russian: 50, physics: 50, informatics: 50 };
    expect(calculateTotalScore(base, null)).toBe(150);
    expect(calculateTotalScore(base, undefined)).toBe(150);
  });

  it("результат округляется до целого", () => {
    expect(
      calculateTotalScore({ russian: 33, physics: 33, informatics: 34 }),
    ).toBe(100);
  });
});
