// Хелперы для единообразных JSON-ответов API.
import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/types";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(
  message: string,
  status = 400,
  details?: unknown,
): NextResponse {
  const body: ApiError = { error: message };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}

export const unauthorized = () => fail("Требуется авторизация", 401);
export const notFound = (what = "Ресурс") => fail(`${what} не найден`, 404);
