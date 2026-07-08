// Интеграционные тесты POST /api/users/[id]/reset-password (итер. 19).
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

const requireAdmin = vi.fn();
const hashPassword = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAdmin: (...a: unknown[]) => requireAdmin(...a),
  hashPassword: (...a: unknown[]) => hashPassword(...a),
}));

import { POST } from "./route";

function req(body: unknown) {
  return {
    json: async () => body,
    method: "POST",
  } as unknown as Parameters<typeof POST>[0];
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/users/[id]/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ id: 1, role: "admin" });
    findUnique.mockResolvedValue({ id: 5, tokenVersion: 2 });
    hashPassword.mockResolvedValue("NEWHASH");
    update.mockResolvedValue({});
  });

  it("403 если не админ", async () => {
    requireAdmin.mockResolvedValue(null);
    const res = await POST(req({ newPassword: "longenough" }), ctx("5"));
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("400 при некорректном id", async () => {
    const res = await POST(req({ newPassword: "longenough" }), ctx("abc"));
    expect(res.status).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("404 если пользователя нет", async () => {
    findUnique.mockResolvedValue(null);
    const res = await POST(req({ newPassword: "longenough" }), ctx("5"));
    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("422 если пароль короче 8", async () => {
    const res = await POST(req({ newPassword: "short" }), ctx("5"));
    expect(res.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });

  it("200: хеширует пароль и инкрементит tokenVersion (отзыв сессий)", async () => {
    const res = await POST(req({ newPassword: "newpass12" }), ctx("5"));
    expect(res.status).toBe(200);
    expect(hashPassword).toHaveBeenCalledWith("newpass12");
    const arg = update.mock.calls[0][0];
    expect(arg.where.id).toBe(5);
    expect(arg.data.passwordHash).toBe("NEWHASH");
    expect(arg.data.tokenVersion).toBe(3); // было 2 → +1
  });
});
