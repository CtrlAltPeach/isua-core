// Интеграционные тесты GET /api/programs/stats (итер. 21).
// Лёгкий эндпоинт для вкладки «Программы»: 1 запрос к БД, без history и без
// верхнеуровневых метрик. Проверяем структуру ответа и авторизацию.
import { describe, it, expect, vi, beforeEach } from "vitest";

const programFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    program: { findMany: (...a: unknown[]) => programFindMany(...a) },
  },
}));

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
}));

import { GET } from "./route";

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
        applicants: [
          { fullName: "Иванов", status: "applied", totalScore: 250, consentToEnroll: true, documentsComplete: true, isPaid: false, isDistant: true, createdAt: new Date("2026-01-01") },
          { fullName: "Петров", status: "applied", totalScore: 200, consentToEnroll: false, documentsComplete: false, isPaid: false, isDistant: false, createdAt: new Date("2026-01-01") },
        ],
      },
    ]);
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
    expect(p.withDistant).toBe(1);
    expect(p.distantWithConsent).toBe(1);
    expect(p.applied).toBe(2);
    expect(p.withdrawn).toBe(0);
    expect(p.avgScore).toBe(225);
    expect(p.consentFillPercent).toBe(20); // 1/5 = 20%
    expect(p.competition).toBe(0.4); // 2/5 = 0.4
  });

  it("topApplicants возвращает топ-3 по баллу", async () => {
    const res = await GET(req());
    const body = await res.json();
    const p = body.byProgram[0];
    expect(p.topApplicants).toHaveLength(2);
    expect(p.topApplicants[0].fullName).toBe("Иванов"); // 250 > 200
    expect(p.topApplicants[0].totalScore).toBe(250);
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

  it("делает ровно 1 запрос к БД (findMany)", async () => {
    await GET(req());
    expect(programFindMany).toHaveBeenCalledTimes(1);
  });
});
