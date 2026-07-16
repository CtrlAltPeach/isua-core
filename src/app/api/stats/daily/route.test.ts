// Интеграционные тесты GET /api/stats/daily.
// Проверяем структуру ответа, в т.ч. пересечение distant × consent (итер. 19.1).
//
// Итер. 21: маршрут рефакторен — count теперь вызывается только для total и
// newToday (раньше было 7 count + groupBy). Верхнеуровневые метрики считаются
// из загруженных applicants программ. Мок упрощён под новую структуру.
import { describe, it, expect, vi, beforeEach } from "vitest";

const count = vi.fn();
const historyFindMany = vi.fn();
const programFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    applicant: {
      count: (...a: unknown[]) => count(...a),
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

    // count теперь вызывается только дважды: total (без where) и newToday
    // (where.createdAt). Различаем по наличию where.createdAt в аргументе.
    count.mockImplementation((arg?: { where?: Record<string, unknown> }) => {
      if (arg?.where?.createdAt) return Promise.resolve(0); // newToday
      return Promise.resolve(4); // total
    });
    historyFindMany.mockResolvedValue([]);
    // Две программы; первая — 2 абитуриента (один дистант+согласие, второй обычный);
    // вторая — 1 дистант без согласия (платный, withdrawn).
    programFindMany.mockResolvedValue([
      {
        id: 1,
        name: "Программа А",
        places: 5,
        programGroup: { id: 1, name: "Группа 1", sortOrder: 0 },
        applicants: [
          { fullName: "Иванов", status: "applied", totalScore: 250, consentToEnroll: true, documentsComplete: true, isPaid: false, isDistant: true, createdAt: new Date("2026-01-01") },
          { fullName: "Петров", status: "applied", totalScore: 200, consentToEnroll: false, documentsComplete: false, isPaid: false, isDistant: false, createdAt: new Date("2026-01-01") },
        ],
      },
      {
        id: 2,
        name: "Программа Б",
        places: 3,
        programGroup: { id: 1, name: "Группа 1", sortOrder: 0 },
        applicants: [
          { fullName: "Сидоров", status: "withdrawn", totalScore: null, consentToEnroll: false, documentsComplete: false, isPaid: true, isDistant: true, createdAt: new Date("2026-01-01") },
        ],
      },
    ]);
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

  it("верхнеуровневые метрики считаются из загруженных applicants (без отдельных count)", async () => {
    // Итер. 21: withConsent/withDocuments/withPaid/applied/withdrawn больше не
    // запрашиваются отдельными count — они суммируются из byProgram.
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
    // Ни один count не ищет по consentToEnroll/documentsComplete/isPaid — эти
    // фильтры ушли из запросов.
    const countWheres = count.mock.calls.map((c) => c[0]?.where).filter(Boolean);
    expect(countWheres).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ consentToEnroll: expect.anything() }),
      ]),
    );
  });
});
