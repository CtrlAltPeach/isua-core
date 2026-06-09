// GET /api/auth/me — текущий пользователь по токену.
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();
  return ok({ user });
}
