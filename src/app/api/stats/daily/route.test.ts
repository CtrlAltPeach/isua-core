// Интеграционные тесты GET /api/stats/daily.
// Проверяем структуру ответа, в т.ч. пересечение distant × consent (итер. 19.1).
import { describe, it, expect, vi, beforeEach } from "vitest";

const count = vi.fn();
const groupBy = vi.fn();
const historyFindMany = vi.fn();
const programFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    applicant: {
      count: (...a: unknown[]) => count(...a),
      groupBy: (...a: unknown[]) => groupBy(...a),
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

    // count вызывается параллельно в Promise.all — определяем результат по where,
    // а не по порядку вызовов (порядок недетерминирован).
    count.mockImplementation((arg?: { where?: Record<string, unknown> }) => {
      const w = arg?.where ?? {};
      // Пересечение distant × consent — проверяем первым (наиболее специфичное).
      if (w.isDistant === true && w.consentToEnroll === true) return Promise.resolve(1);
      if (w.consentToEnroll === true) return Promise.resolve(2); // withConsent
      if (w.documentsComplete === true) return Promise.resolve(3); // withDocuments
      if (w.isPaid === true) return Promise.resolve(1); // withPaid
      if (w.isDistant === true) return Promise.resolve(2); // withDistant
      if (w.createdAt) return Promise.resolve(0); // newToday
      return Promise.resolve(4); // total
    });
    groupBy.mockResolvedValue([
      { status: "applied", _count: { _all: 3 } },
      { status: "withdrawn", _count: { _all: 1 } },
    ]);
    historyFindMany.mockResolvedValue([]);
    // Две программы; первая — 2 абитуриента (один дистант+согласие, второй обычный);
    // вторая — 1 дистант без согласия.
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

  it("distantWithConsent считается с обоими флагами true (пересечение)", async () => {
    // Проверяем, что count для distantWithConsent ушёл с where {isDistant,consentToEnroll}.
    await GET(req());
    const intersectCall = count.mock.calls.find(
      (c) =>
        c[0]?.where?.isDistant === true &&
        c[0]?.where?.consentToEnroll === true,
    );
    expect(intersectCall).toBeDefined();
  });
});
