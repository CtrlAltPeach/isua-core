// Интеграционные тесты POST /api/program-groups (итер. 15): admin-only,
// валидация, дубликат имени, успешное создание. Prisma и auth мокаются.
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const create = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    programGroup: {
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

describe("POST /api/program-groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ id: 1, role: "admin" });
    findUnique.mockResolvedValue(null);
    create.mockImplementation(async ({ data }) => ({ id: 7, ...data }));
  });

  it("403 если не админ", async () => {
    requireAdmin.mockResolvedValue(null);
    const res = await POST(postReq({ name: "Инженерные" }));
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("422 при невалидном теле (нет name)", async () => {
    const res = await POST(postReq({ sortOrder: 1 }));
    expect(res.status).toBe(422);
    expect(create).not.toHaveBeenCalled();
  });

  it("409 если группа с таким именем уже есть", async () => {
    findUnique.mockResolvedValue({ id: 3 });
    const res = await POST(postReq({ name: "Инженерные" }));
    expect(res.status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it("201 и созданная группа при валидных данных", async () => {
    const res = await POST(postReq({ name: "Землеустройство", sortOrder: 2 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: 7, name: "Землеустройство", sortOrder: 2 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("sortOrder по умолчанию 0, если не передан", async () => {
    const res = await POST(postReq({ name: "Прочие" }));
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith({
      data: { name: "Прочие", sortOrder: 0 },
    });
  });
});
