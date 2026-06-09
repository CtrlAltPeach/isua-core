// POST /api/auth/logout — выход (очистка cookie).
import { clearAuthCookie } from "@/lib/auth";
import { ok } from "@/lib/http";

export async function POST() {
  await clearAuthCookie();
  return ok({ success: true });
}
