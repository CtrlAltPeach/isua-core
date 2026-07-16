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
    it("examType=vi + общий viScore: total = viScore + доп. баллы (ЕГЭ игнорируется)", () => {
      expect(
        calculateTotalScore(
          { russian: 90, physics: 80, informatics: 70 },
          5,
          250,
          "vi",
        ),
      ).toBe(255); // 250 + 5, сумма ЕГЭ (240) не учитывается
    });

    it("examType=vi без viScore: total = топ-3 vi-предметов + доп. баллы", () => {
      expect(
        calculateTotalScore(
          { russian: 90 },
          5,
          null,
          "vi",
          { viRussian: 85, viPhysics: 72, viInformatics: 90, viChemistry: 40 },
        ),
      ).toBe(252); // топ-3 vi (85+90+72=247) + 5; ЕГЭ и 4-й vi-предмет игнорируются
    });

    it("examType=vi, <3 vi-предметов и без viScore → null", () => {
      expect(
        calculateTotalScore({}, 5, null, "vi", { viRussian: 80, viPhysics: 70 }),
      ).toBeNull();
    });

    it("examType=vi без предметов и без viScore → null", () => {
      expect(calculateTotalScore({}, 5, null, "vi")).toBeNull();
    });

    it("examType=vi: viScore=0 — валидный балл (не путать с null)", () => {
      expect(calculateTotalScore({}, 3, 0, "vi")).toBe(3);
    });

    it("examType=vi: общий viScore приоритетнее vi-предметов", () => {
      expect(
        calculateTotalScore(
          {},
          0,
          200,
          "vi",
          { viRussian: 100, viPhysics: 100, viInformatics: 100 },
        ),
      ).toBe(200); // 300 vi-предметов проигнорированы, взят viScore
    });

    it("examType=ege игнорирует viScore и vi-предметы", () => {
      const base = { russian: 80, physics: 70, informatics: 60 };
      expect(calculateTotalScore(base, 0, 250, "ege")).toBe(210); // viScore=250 проигнорирован
    });

    it("examType=ege: <3 предметов → null (viScore не спасает)", () => {
      expect(calculateTotalScore({ russian: 80 }, 0, 250, "ege")).toBeNull();
    });

    it("ВИ + доп. баллы может превышать 300", () => {
      expect(calculateTotalScore({}, 10, 300, "vi")).toBe(310);
    });
  });
});
