// GET /api/programs — список программ с количеством абитуриентов и конкурсом.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const programs = await prisma.program.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { applicants: true } } },
  });

  const result = programs.map((p) => ({
    id: p.id,
    name: p.name,
    places: p.places,
    applicantCount: p._count.applicants,
    // Конкурс: абитуриентов на место (0 мест → null).
    competition:
      p.places > 0
        ? Math.round((p._count.applicants / p.places) * 100) / 100
        : null,
  }));

  return ok(result);
}
