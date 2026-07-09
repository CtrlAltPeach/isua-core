// Интеграционные тесты роутера GET /api/applicants (12C): авторизация,
// построение where (поиск/фильтры), пагинация. Prisma и auth мокаются.
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Моки внешних зависимостей роута ---
const findMany = vi.fn();
const count = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { applicant: { findMany: (...a: unknown[]) => findMany(...a), count: (...a: unknown[]) => count(...a) } },
}));

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
}));

// PII-декрипт не тестируем здесь — пропускаем как есть.
vi.mock("@/lib/applicant-pii", () => ({
  decryptPiiList: (items: unknown) => items,
  encryptPii: (x: unknown) => x,
  decryptPii: (x: unknown) => x,
}));

import { GET } from "./route";

// Минимальный NextRequest-подобный объект: роуту нужны только nextUrl и метод.
function reqWith(query: string) {
  const url = new URL(`http://localhost/api/applicants${query}`);
  return { nextUrl: url, method: "GET" } as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/applicants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    getCurrentUser.mockResolvedValue({ id: 1, role: "operator" });
  });

  it("401 без авторизации", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(reqWith(""));
    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("поиск строит OR contains insensitive по ФИО/email/телефону", async () => {
    await GET(reqWith("?search=петров"));
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { fullName: { contains: "петров", mode: "insensitive" } },
      { email: { contains: "петров", mode: "insensitive" } },
      { phone: { contains: "петров", mode: "insensitive" } },
    ]);
  });

  it("фильтры по статусу и программе попадают в where", async () => {
    await GET(reqWith("?status=withdrawn&program_id=3"));
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.status).toBe("withdrawn");
    expect(arg.where.programId).toBe(3);
  });

  it("невалидный статус игнорируется (не уходит в where)", async () => {
    await GET(reqWith("?status=__bad__"));
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.status).toBeUndefined();
  });

  it("чипы-маркеры попадают в where как true", async () => {
    await GET(reqWith("?ok=1&consent=1&docs=1&paid=1&distant=1&op=1"));
    const arg = findMany.mock.calls[0][0].where;
    expect(arg.specialQuota).toBe(true);
    expect(arg.specialRight).toBe(true);
    expect(arg.consentToEnroll).toBe(true);
    expect(arg.documentsComplete).toBe(true);
    expect(arg.isPaid).toBe(true);
    expect(arg.isDistant).toBe(true);
  });

  it("несколько чипов комбинируются через AND (все true)", async () => {
    await GET(reqWith("?consent=1&docs=1"));
    const arg = findMany.mock.calls[0][0].where;
    expect(arg.consentToEnroll).toBe(true);
    expect(arg.documentsComplete).toBe(true);
    // Неактивные чипы не задают фильтр.
    expect(arg.specialQuota).toBeUndefined();
    expect(arg.isPaid).toBeUndefined();
  });

  it("чип со значением != 1 игнорируется", async () => {
    await GET(reqWith("?ok=0&consent=true"));
    const arg = findMany.mock.calls[0][0].where;
    expect(arg.specialQuota).toBeUndefined();
    expect(arg.consentToEnroll).toBeUndefined();
  });

  it("пагинация: page=2 limit=25 → skip=25 take=25", async () => {
    await GET(reqWith("?page=2&limit=25"));
    const arg = findMany.mock.calls[0][0];
    expect(arg.skip).toBe(25);
    expect(arg.take).toBe(25);
  });

  it("limit ограничен сверху 100", async () => {
    await GET(reqWith("?limit=9999"));
    expect(findMany.mock.calls[0][0].take).toBe(100);
  });

  it("limit=0 → «Все»: skip/take убираются (без пагинации)", async () => {
    await GET(reqWith("?limit=0"));
    const arg = findMany.mock.calls[0][0];
    expect(arg.skip).toBeUndefined();
    expect(arg.take).toBeUndefined();
  });

  it("без limit → дефолт 50", async () => {
    await GET(reqWith(""));
    expect(findMany.mock.calls[0][0].take).toBe(50);
  });

  it("неразрешённое поле сортировки откатывается на createdAt", async () => {
    await GET(reqWith("?sort_by=passwordHash"));
    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: "desc" },
      { createdAt: "desc" },
    ]);
  });

  it("NOT NULL поле сортируется простой формой + тай-брейк по createdAt", async () => {
    await GET(reqWith("?sort_by=fullName&order=asc"));
    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { fullName: "asc" },
      { createdAt: "desc" },
    ]);
  });

  it("nullable totalScore сортируется с NULLS LAST (прочерки в конце)", async () => {
    await GET(reqWith("?sort_by=totalScore&order=desc"));
    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { totalScore: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ]);
  });

  it("totalScore ASC тоже с NULLS LAST", async () => {
    await GET(reqWith("?sort_by=totalScore&order=asc"));
    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { totalScore: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ]);
  });

  it("возвращает items/total/page/limit", async () => {
    findMany.mockResolvedValue([{ id: 7 }]);
    count.mockResolvedValue(1);
    const res = await GET(reqWith("?page=1&limit=50"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ total: 1, page: 1, limit: 50 });
    expect(body.items).toHaveLength(1);
  });
});
