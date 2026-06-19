// Интеграционные тесты POST /api/auth/change-password (D2).
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

const getCurrentUser = vi.fn();
const verifyPassword = vi.fn();
const hashPassword = vi.fn();
const signToken = vi.fn();
const setAuthCookie = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
  verifyPassword: (...a: unknown[]) => verifyPassword(...a),
  hashPassword: (...a: unknown[]) => hashPassword(...a),
  signToken: (...a: unknown[]) => signToken(...a),
  setAuthCookie: (...a: unknown[]) => setAuthCookie(...a),
}));

import { POST } from "./route";

function req(body: unknown) {
  return { json: async () => body, method: "POST" } as unknown as Parameters<
    typeof POST
  >[0];
}

describe("POST /api/auth/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: 1, role: "operator" });
    findUnique.mockResolvedValue({ id: 1, passwordHash: "OLDHASH", tokenVersion: 2 });
    hashPassword.mockResolvedValue("NEWHASH");
    signToken.mockResolvedValue("tok");
    update.mockImplementation(async ({ data }) => ({
      id: 1,
      email: "a@b.c",
      username: "u",
      role: "operator",
      ...data,
    }));
  });

  it("401 без авторизации", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ currentPassword: "x", newPassword: "longenough" }));
    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("422 если новый пароль короче 8", async () => {
    const res = await POST(req({ currentPassword: "x", newPassword: "short" }));
    expect(res.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });

  it("400 если текущий пароль неверен", async () => {
    verifyPassword.mockResolvedValueOnce(false); // current не совпал
    const res = await POST(
      req({ currentPassword: "wrong", newPassword: "longenough" }),
    );
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("400 если новый пароль совпадает с текущим", async () => {
    verifyPassword
      .mockResolvedValueOnce(true) // current верен
      .mockResolvedValueOnce(true); // new == old
    const res = await POST(
      req({ currentPassword: "same12345", newPassword: "same12345" }),
    );
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("200: меняет пароль и инкрементит tokenVersion + перевыдаёт токен", async () => {
    verifyPassword
      .mockResolvedValueOnce(true) // current верен
      .mockResolvedValueOnce(false); // new != old
    const res = await POST(
      req({ currentPassword: "old12345", newPassword: "new123456" }),
    );
    expect(res.status).toBe(200);
    const arg = update.mock.calls[0][0];
    expect(arg.data.passwordHash).toBe("NEWHASH");
    expect(arg.data.tokenVersion).toBe(3); // было 2 → +1
    expect(signToken).toHaveBeenCalledWith(
      expect.objectContaining({ ver: 3 }),
    );
    expect(setAuthCookie).toHaveBeenCalledWith("tok");
  });
});
