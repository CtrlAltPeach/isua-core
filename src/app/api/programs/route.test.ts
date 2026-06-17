// Интеграционные тесты POST /api/programs (12C): admin-only, валидация,
// дубликат имени, успешное создание. Prisma и auth мокаются.
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const create = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    program: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      create: (...a: unknown[]) => create(...a),
      findMany: vi.fn(),
    },
  },
}));

const requireAdmin = vi.fn();
const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAdmin: (...a: unknown[]) => requireAdmin(...a),
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
}));

import { POST } from "./route";

function postReq(body: unknown) {
  return {
    json: async () => body,
    method: "POST",
  } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/programs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ id: 1, role: "admin" });
    findUnique.mockResolvedValue(null);
    create.mockImplementation(async ({ data }) => ({ id: 99, ...data }));
  });

  it("403 если не админ", async () => {
    requireAdmin.mockResolvedValue(null);
    const res = await POST(postReq({ name: "Новая", places: 10 }));
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("422 при невалидном теле (нет name)", async () => {
    const res = await POST(postReq({ places: 10 }));
    expect(res.status).toBe(422);
    expect(create).not.toHaveBeenCalled();
  });

  it("409 если программа с таким именем уже есть", async () => {
    findUnique.mockResolvedValue({ id: 5 });
    const res = await POST(postReq({ name: "ИСД", places: 10 }));
    expect(res.status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it("201 и созданная программа при валидных данных", async () => {
    const res = await POST(postReq({ name: "Новая программа", places: 25 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: 99, name: "Новая программа", places: 25 });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
