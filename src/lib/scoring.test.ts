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

  describe("ВИ (вступительные испытания)", () => {
    it("ВИ заменяет сумму ЕГЭ: total = ВИ + доп. баллы", () => {
      // Предметы ЕГЭ заданы, но игнорируются — берётся ВИ.
      expect(
        calculateTotalScore(
          { russian: 90, physics: 80, informatics: 70 },
          5,
          250,
        ),
      ).toBe(255); // 250 + 5, сумма ЕГЭ (240) не учитывается
    });

    it("ВИ работает без предметов ЕГЭ (поступление без ЕГЭ)", () => {
      expect(calculateTotalScore({}, 0, 180)).toBe(180);
      expect(calculateTotalScore({ russian: 50 }, 0, 200)).toBe(200);
    });

    it("ВИ = 0 — валидный балл (не путать с null)", () => {
      expect(calculateTotalScore({}, 3, 0)).toBe(3);
    });

    it("ВИ null/undefined — расчёт по ЕГЭ (старое поведение)", () => {
      const base = { russian: 80, physics: 70, informatics: 60 };
      expect(calculateTotalScore(base, 0, null)).toBe(210);
      expect(calculateTotalScore(base, 0, undefined)).toBe(210);
    });

    it("ВИ + доп. баллы может превышать 300", () => {
      expect(calculateTotalScore({}, 10, 300)).toBe(310);
    });
  });
});
