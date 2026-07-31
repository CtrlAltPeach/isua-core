// Интеграционные тесты GET /api/stats/daily.
// Проверяем структуру ответа, в т.ч. пересечение distant × consent (итер. 19.1).
//
// Итерация 22: агрегаты переведены на БД (groupBy/aggregate). Мок содержит
// applicant.groupBy (вместо вложенных applicants в program.findMany). count
// вызывается дважды: total и newToday. Верхнеуровневые метрики суммируются из byProgram.
import { describe, it, expect, vi, beforeEach } from "vitest";

const count = vi.fn();
const historyFindMany = vi.fn();
const programFindMany = vi.fn();
const applicantGroupBy = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    applicant: {
      count: (...a: unknown[]) => count(...a),
      groupBy: (...a: unknown[]) => applicantGroupBy(...a),
    },
    history: { findMany: (...a: unknown[]) => historyFindMany(...a) },
    program: { findMany: (...a: unknown[]) => programFindMany(...a) },
  },
}));

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
}));

import { GET } from "./route";

// Спецификация данных (как раньше было в applicants, теперь разбито по агрегатам):
// Программа 1 (мест 5): Иванов 250 applied+consent+docs+distant; Петров 200 applied.
// Программа 2 (мест 3): Сидоров withdrawn, платный, distant, без consent, без балла.
function specGroupBy(arg: {
  by?: string[];
  where?: Record<string, unknown>;
  _avg?: unknown;
}): { programId: number; [k: string]: unknown }[] {
  // count + avg (без where, с _avg).
  if (arg._avg) {
    return [
      { programId: 1, _count: { _all: 2 }, _avg: { totalScore: 225 } },
      { programId: 2, _count: { _all: 1 }, _avg: { totalScore: null } },
    ];
  }
  // Разбивка по статусам.
  if (arg.by?.includes("status")) {
    return [
      { programId: 1, status: "applied", _count: { _all: 2 } },
      { programId: 2, status: "withdrawn", _count: { _all: 1 } },
    ];
  }
  // newToday (where.createdAt).
  if (arg.where?.createdAt) {
    return [
      { programId: 1, _count: { _all: 0 } },
      { programId: 2, _count: { _all: 0 } },
    ];
  }
  const w = arg.where ?? {};
  if (w.isDistant && w.consentToEnroll)
    return [{ programId: 1, _count: { _all: 1 } }]; // Иванов
  if (w.consentToEnroll)
    return [{ programId: 1, _count: { _all: 1 } }]; // Иванов
  if (w.documentsComplete)
    return [{ programId: 1, _count: { _all: 1 } }]; // Иванов
  if (w.isPaid) return [{ programId: 2, _count: { _all: 1 } }]; // Сидоров
  if (w.isDistant)
    return [
      { programId: 1, _count: { _all: 1 } }, // Иванов
      { programId: 2, _count: { _all: 1 } }, // Сидоров
    ];
  return [];
}

function req() {
  const url = new URL("http://localhost/api/stats/daily");
  return { nextUrl: url, method: "GET" } as unknown as Parameters<
    typeof GET
  >[0];
}

describe("GET /api/stats/daily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: 1, role: "operator" });

    // count вызывается дважды: total (без where) и newToday (where.createdAt).
    count.mockImplementation((arg?: { where?: Record<string, unknown> }) => {
      if (arg?.where?.createdAt) return Promise.resolve(0); // newToday
      return Promise.resolve(4); // total
    });
    historyFindMany.mockResolvedValue([]);
    // Метаданные программ БЕЗ applicants.
    programFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Программа А",
        places: 5,
        programGroup: { id: 1, name: "Группа 1", sortOrder: 0 },
      },
      {
        id: 2,
        name: "Программа Б",
        places: 3,
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

  it("distantWithConsent присутствует в верхнем уровне ответа", async () => {
    const res = await GET(req());
    const body = await res.json();
    expect(body.distantWithConsent).toBe(1);
    expect(body.withDistant).toBe(2);
  });

  it("byProgram содержит distantWithConsent по каждой программе", async () => {
    const res = await GET(req());
    const body = await res.json();
    const a = body.byProgram.find((p: { program: string }) => p.program === "Программа А");
    const b = body.byProgram.find((p: { program: string }) => p.program === "Программа Б");
    expect(a.distantWithConsent).toBe(1); // Иванов: distant+consent
    expect(a.withDistant).toBe(1);
    expect(b.distantWithConsent).toBe(0); // Сидоров: distant, но без consent
    expect(b.withDistant).toBe(1);
  });

  it("byGroup subtotal суммирует distantWithConsent по программам группы", async () => {
    const res = await GET(req());
    const body = await res.json();
    expect(body.byGroup).toHaveLength(1);
    const g = body.byGroup[0];
    expect(g.subtotal.withDistant).toBe(2);
    expect(g.subtotal.distantWithConsent).toBe(1);
  });

  it("верхнеуровневые метрики считаются из БД-агрегатов", async () => {
    const res = await GET(req());
    const body = await res.json();
    // 1 согласие (Иванов), 1 документ (Иванов), 1 платный (Сидоров).
    expect(body.withConsent).toBe(1);
    expect(body.withDocuments).toBe(1);
    expect(body.withPaid).toBe(1);
    expect(body.applied).toBe(2); // Иванов + Петров
    expect(body.withdrawn).toBe(1); // Сидоров
    // count вызван ровно дважды: total и newToday.
    expect(count).toHaveBeenCalledTimes(2);
  });
});
