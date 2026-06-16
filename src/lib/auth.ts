// Аутентификация: JWT (HS256 через jose) + bcrypt для паролей.
// Токен хранится в httpOnly-cookie `isua_token`; также принимается заголовок
// `Authorization: Bearer <token>`.
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const TOKEN_COOKIE = "isua_token";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Падаем рано: без секрета токены небезопасны.
  throw new Error("JWT_SECRET не задан в окружении");
}
const secretKey = new TextEncoder().encode(JWT_SECRET);

// TTL токена в секундах (по умолчанию 24ч). JWT_EXPIRY вида "24h".
function expirySeconds(): number {
  const raw = process.env.JWT_EXPIRY ?? "24h";
  const m = /^(\d+)([smhd])$/.exec(raw.trim());
  if (!m) return 24 * 60 * 60;
  const n = Number(m[1]);
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as "s" | "m" | "h" | "d"];
  return n * mult;
}

export type Role = "admin" | "operator";

export interface TokenPayload {
  sub: string; // user id
  email: string;
  username: string;
  role: Role;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(payload: TokenPayload): Promise<string> {
  const ttl = expirySeconds();
  return new SignJWT({
    email: payload.email,
    username: payload.username,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (!payload.sub) return null;
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ""),
      username: String(payload.username ?? ""),
      // Старые токены без role трактуем как operator (наименьшие права).
      role: payload.role === "admin" ? "admin" : "operator",
    };
  } catch {
    return null;
  }
}

// Устанавливает httpOnly-cookie с токеном (вызывать в route handler).
export async function setAuthCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expirySeconds(),
  });
}

export async function clearAuthCookie(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
}

// Достаёт токен из cookie или заголовка Authorization.
function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.cookies.get(TOKEN_COOKIE)?.value ?? null;
}

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  role: Role;
}

/**
 * Возвращает текущего пользователя по токену из запроса, либо null.
 * Проверяет, что пользователь реально существует в БД. Роль берётся из БД
 * (а не из токена), чтобы изменение роли применялось немедленно.
 */
export async function getCurrentUser(
  req: NextRequest,
): Promise<AuthUser | null> {
  const token = extractToken(req);
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId)) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, role: true },
  });
  return user;
}

/**
 * Текущий пользователь, только если он admin; иначе null.
 * Использовать в admin-only route handlers перед действием.
 */
export async function requireAdmin(
  req: NextRequest,
): Promise<AuthUser | null> {
  const user = await getCurrentUser(req);
  return user && user.role === "admin" ? user : null;
}
