// Интеграционные тесты GET /api/programs/stats (итер. 21/22).
// Лёгкий эндпоинт для вкладки «Программы»: агрегаты считаются на уровне БД
// (Prisma groupBy/aggregate). Проверяем структуру ответа и авторизацию.
//
// Итерация 22: мок переключён с program.findMany({include:{applicants}}) на
// program.findMany (без applicants) + applicant.groupBy. groupBy различаем по
// аргументам: наличие _avg → count+avg, by включает "status" → разбивка статусов,
// иначе по where-флагу.
import { describe, it, expect, vi, beforeEach } from "vitest";

const programFindMany = vi.fn();
const applicantGroupBy = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    program: { findMany: (...a: unknown[]) => programFindMany(...a) },
    applicant: { groupBy: (...a: unknown[]) => applicantGroupBy(...a) },
  },
}));

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
}));

import { GET } from "./route";

// Параметризованный мок groupBy: по аргументу запроса выбираем, какой массив отдать.
// Спецификация агрегатов программы 1 (Иванов 250 applied+consent+docs+distant,
// Петров 200 applied, без флагов).
function specGroupBy(arg: {
  by?: string[];
  where?: Record<string, unknown>;
  _avg?: unknown;
}): { programId: number; [k: string]: unknown }[] {
  // count + avg (без where, с _avg).
  if (arg._avg) {
    return [{ programId: 1, _count: { _all: 2 }, _avg: { totalScore: 225 } }];
  }
  // Разбивка по статусам (by включает "status").
  if (arg.by?.includes("status")) {
    return [{ programId: 1, status: "applied", _count: { _all: 2 } }];
  }
  // Флаговые where.
  const w = arg.where ?? {};
  if (w.isDistant && w.consentToEnroll)
    return [{ programId: 1, _count: { _all: 1 } }];
  if (w.consentToEnroll) return [{ programId: 1, _count: { _all: 1 } }];
  if (w.documentsComplete) return [{ programId: 1, _count: { _all: 1 } }];
  if (w.isPaid) return []; // 0 платных
  if (w.isDistant) return [{ programId: 1, _count: { _all: 1 } }];
  return [];
}

function req() {
  const url = new URL("http://localhost/api/programs/stats");
  return { nextUrl: url, method: "GET" } as unknown as Parameters<
    typeof GET
  >[0];
}

describe("GET /api/programs/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: 1, role: "operator" });
    programFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Программа А",
        places: 5,
        programGroup: { id: 1, name: "Группа 1", sortOrder: 0 },
      },
    ]);
    applicantGroupBy.mockImplementation((arg) => Promise.resolve(specGroupBy(arg)));
  });

  it("401 без авторизации", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("возвращает byProgram с агрегатами", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.byProgram).toHaveLength(1);
    const p = body.byProgram[0];
    expect(p.programId).toBe(1);
    expect(p.program).toBe("Программа А");
    expect(p.places).toBe(5);
    expect(p.applicants).toBe(2);
    expect(p.withConsent).toBe(1);
    expect(p.withDocuments).toBe(1);
    expect(p.withPaid).toBe(0);
    expect(p.withDistant).toBe(1);
    expect(p.distantWithConsent).toBe(1);
    expect(p.applied).toBe(2);
    expect(p.withdrawn).toBe(0);
    expect(p.avgScore).toBe(225);
    expect(p.consentFillPercent).toBe(20); // 1/5 = 20%
    expect(p.competition).toBe(0.4); // 2/5 = 0.4
  });

  it("newToday/consentGivenToday = 0 (дневное окно не передаётся)", async () => {
    // Лёгкий эндпоинт не запрашивает историю — дневные метрики всегда 0.
    const res = await GET(req());
    const body = await res.json();
    const p = body.byProgram[0];
    expect(p.newToday).toBe(0);
    expect(p.consentGivenToday).toBe(0);
    expect(p.consentWithdrawnToday).toBe(0);
  });

  it("агрегаты берутся из БД (program.findMany без applicants)", async () => {
    await GET(req());
    // program.findMany вызван без include.applicants.
    expect(programFindMany).toHaveBeenCalledTimes(1);
    const findManyArg = programFindMany.mock.calls[0][0];
    expect(findManyArg.include?.applicants).toBeUndefined();
    // groupBy вызван многократно (агрегаты на уровне БД).
    expect(applicantGroupBy).toHaveBeenCalled();
  });
});
