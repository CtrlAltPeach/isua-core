// Тесты GET /api/applicants/[id]/history: событие «создание записи» (с автором)
// добавляется как самое старое. Prisma и auth мокаются.
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const count = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    history: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
    applicant: {
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
}));

import { GET } from "./route";

function getReq(qs = "") {
  return {
    nextUrl: { searchParams: new URLSearchParams(qs) },
  } as unknown as Parameters<typeof GET>[0];
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET history — событие создания записи", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: 1 });
    findUnique.mockResolvedValue({
      createdAt: new Date("2026-06-01T10:00:00Z"),
      createdBy: { id: 3, username: "creator", email: "c@isua.local" },
    });
  });

  it("добавляет «created» с создателем как самое старое событие", async () => {
    count.mockResolvedValue(1);
    findMany.mockResolvedValue([
      {
        id: 5,
        fieldName: "status",
        oldValue: "applied",
        newValue: "withdrawn",
        changedAt: new Date("2026-06-02T10:00:00Z"),
        changedBy: { id: 2, username: "op", email: "o@isua.local" },
      },
    ]);
    const res = await GET(getReq(), ctx("10"));
    const body = await res.json();
    expect(body).toHaveLength(2);
    const created = body[body.length - 1]; // самое старое — в конце (desc)
    expect(created.fieldName).toBe("created");
    expect(created.changedBy.username).toBe("creator");
  });

  it("показывает создание даже без изменений", async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);
    const res = await GET(getReq(), ctx("10"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].fieldName).toBe("created");
    expect(body[0].changedBy.username).toBe("creator");
  });

  it("не добавляет создание на НЕ последней странице (есть ещё старше)", async () => {
    count.mockResolvedValue(60); // всего 60, вернули 50 с offset 0 → не последняя
    findMany.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        fieldName: "notes",
        oldValue: null,
        newValue: "x",
        changedAt: new Date(),
        changedBy: { id: 2, username: "op", email: "o@isua.local" },
      })),
    );
    const res = await GET(getReq("limit=50&offset=0"), ctx("10"));
    const body = await res.json();
    expect(body).toHaveLength(50);
    expect(body.some((e: { fieldName: string }) => e.fieldName === "created")).toBe(
      false,
    );
  });
});
