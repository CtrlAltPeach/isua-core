// Unit-тесты чистого мёрджера aggregateProgramStats / groupProgramStats (итер. 22).
// Мёрджер не делает запросов к БД — на входе метаданные программ + Map'ы агрегатов.
import { describe, it, expect } from "vitest";
import {
  aggregateProgramStats,
  groupProgramStats,
  type ProgramMeta,
  type ProgramAggregatesInput,
} from "@/lib/program-stats";

function makeAgg(overrides: Partial<ProgramAggregatesInput> = {}): ProgramAggregatesInput {
  return {
    applicants: new Map(),
    avgScore: new Map(),
    withConsent: new Map(),
    withDocuments: new Map(),
    withPaid: new Map(),
    withDistant: new Map(),
    distantWithConsent: new Map(),
    applied: new Map(),
    withdrawn: new Map(),
    ...overrides,
  };
}

const prog: ProgramMeta = {
  id: 1,
  name: "Программа А",
  places: 5,
  programGroup: { id: 1, name: "Группа 1", sortOrder: 0 },
};

describe("aggregateProgramStats", () => {
  it("минимальный случай: все агрегаты default 0/null при пустых Map'ах", () => {
    const rows = aggregateProgramStats([prog], makeAgg());
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.applicants).toBe(0);
    expect(r.avgScore).toBeNull();
    expect(r.withConsent).toBe(0);
    expect(r.distantWithConsent).toBe(0);
    expect(r.applied).toBe(0);
    expect(r.withdrawn).toBe(0);
    expect(r.competition).toBe(0); // 0/5
    expect(r.consentFillPercent).toBe(0);
    expect(r.newToday).toBe(0);
    expect(r.consentGivenToday).toBe(0);
  });

  it("считает competition и consentFillPercent из places и агрегатов", () => {
    const agg = makeAgg({
      applicants: new Map([[1, 2]]),
      withConsent: new Map([[1, 1]]),
    });
    const rows = aggregateProgramStats([prog], agg);
    expect(rows[0].applicants).toBe(2);
    expect(rows[0].competition).toBe(0.4); // 2/5
    expect(rows[0].consentFillPercent).toBe(20); // 1/5 = 20%
  });

  it("places=0 → competition null, consentFillPercent 0", () => {
    const agg = makeAgg({
      applicants: new Map([[1, 3]]),
      withConsent: new Map([[1, 1]]),
    });
    const rows = aggregateProgramStats([{ ...prog, places: 0 }], agg);
    expect(rows[0].competition).toBeNull();
    expect(rows[0].consentFillPercent).toBe(0);
  });

  it("avgScore округляется до сотых; null если нет в Map", () => {
    const agg = makeAgg({ avgScore: new Map([[1, 225]]) });
    const rows = aggregateProgramStats([prog, { ...prog, id: 2 }], agg);
    expect(rows[0].avgScore).toBe(225);
    expect(rows[1].avgScore).toBeNull();
  });

  it("newToday только из dayWindow-агрегата; без него — 0", () => {
    const rowsNoWindow = aggregateProgramStats([prog], makeAgg());
    expect(rowsNoWindow[0].newToday).toBe(0);
    const agg = makeAgg({ newToday: new Map([[1, 7]]) });
    const rows = aggregateProgramStats([prog], agg);
    expect(rows[0].newToday).toBe(7);
  });

  it("consentMovement прокидывается из options", () => {
    const rows = aggregateProgramStats([prog], makeAgg(), {
      givenByProgram: new Map([[1, 3]]),
      withdrawnByProgram: new Map([[1, 1]]),
    });
    expect(rows[0].consentGivenToday).toBe(3);
    expect(rows[0].consentWithdrawnToday).toBe(1);
  });

  it("программа без группы → groupId/groupName null", () => {
    const noGroup: ProgramMeta = { ...prog, programGroup: null };
    const rows = aggregateProgramStats([noGroup], makeAgg());
    expect(rows[0].groupId).toBeNull();
    expect(rows[0].groupName).toBeNull();
  });
});

describe("groupProgramStats", () => {
  it("подытог: суммы по строкам группы + конкурс по суммарным местам", () => {
    const p1: ProgramMeta = {
      id: 1,
      name: "А",
      places: 5,
      programGroup: { id: 10, name: "Группа", sortOrder: 0 },
    };
    const p2: ProgramMeta = {
      id: 2,
      name: "Б",
      places: 5,
      programGroup: { id: 10, name: "Группа", sortOrder: 0 },
    };
    const agg = makeAgg({
      applicants: new Map([
        [1, 3],
        [2, 2],
      ]),
      withConsent: new Map([
        [1, 1],
        [2, 1],
      ]),
    });
    const byProgram = aggregateProgramStats([p1, p2], agg);
    const groups = groupProgramStats(byProgram, [p1, p2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupId).toBe(10);
    expect(groups[0].subtotal.applicants).toBe(5);
    expect(groups[0].subtotal.places).toBe(10);
    expect(groups[0].subtotal.withConsent).toBe(2);
    expect(groups[0].subtotal.competition).toBe(0.5); // 5/10
  });

  it("программы без группы → отдельная группа null в конце", () => {
    const p1: ProgramMeta = { ...prog, id: 1, programGroup: null };
    const p2: ProgramMeta = {
      ...prog,
      id: 2,
      programGroup: { id: 10, name: "Группа", sortOrder: 0 },
    };
    const byProgram = aggregateProgramStats([p1, p2], makeAgg());
    const groups = groupProgramStats(byProgram, [p1, p2]);
    expect(groups).toHaveLength(2);
    expect(groups[1].groupId).toBeNull(); // «Без группы» — последняя
  });
});
