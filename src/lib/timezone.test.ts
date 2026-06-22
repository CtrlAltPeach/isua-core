import { describe, it, expect, vi, afterEach } from "vitest";
import {
  tzOffsetMinutes,
  dayBoundsUTC,
  detectTimezone,
  todayInTimeZone,
  FALLBACK_TIMEZONE,
} from "@/lib/timezone";

describe("tzOffsetMinutes", () => {
  it("Москва = UTC+3 (180 минут), без DST круглый год", () => {
    expect(tzOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "Europe/Moscow")).toBe(180);
    expect(tzOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "Europe/Moscow")).toBe(180);
  });

  it("UTC = 0", () => {
    expect(tzOffsetMinutes(new Date("2026-06-17T00:00:00Z"), "UTC")).toBe(0);
  });

  it("Екатеринбург = UTC+5 (300 минут)", () => {
    expect(tzOffsetMinutes(new Date("2026-06-17T00:00:00Z"), "Asia/Yekaterinburg")).toBe(300);
  });
});

describe("dayBoundsUTC", () => {
  it("Москва: сутки начинаются в 21:00 UTC предыдущего дня", () => {
    const [start, end] = dayBoundsUTC("2026-06-17", "Europe/Moscow");
    // 2026-06-17 00:00 МСК = 2026-06-16 21:00 UTC
    expect(start.toISOString()).toBe("2026-06-16T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-17T21:00:00.000Z");
  });

  it("UTC: сутки ровно по UTC", () => {
    const [start, end] = dayBoundsUTC("2026-06-17", "UTC");
    expect(start.toISOString()).toBe("2026-06-17T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-18T00:00:00.000Z");
  });

  it("длительность суток = 24 часа (без DST-зоны)", () => {
    const [start, end] = dayBoundsUTC("2026-06-17", "Europe/Moscow");
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
  });

  it("Екатеринбург: сутки начинаются в 19:00 UTC предыдущего дня", () => {
    const [start] = dayBoundsUTC("2026-06-17", "Asia/Yekaterinburg");
    expect(start.toISOString()).toBe("2026-06-16T19:00:00.000Z");
  });

  it("момент в этих сутках попадает в диапазон, вне — нет", () => {
    const [start, end] = dayBoundsUTC("2026-06-17", "Europe/Moscow");
    // 2026-06-17 10:00 МСК = 07:00 UTC — внутри
    const inside = new Date("2026-06-17T07:00:00Z");
    // 2026-06-16 23:00 МСК = 20:00 UTC — это ещё 16-е по МСК — снаружи
    const before = new Date("2026-06-16T20:00:00Z");
    expect(inside >= start && inside < end).toBe(true);
    expect(before >= start && before < end).toBe(false);
  });
});

describe("todayInTimeZone", () => {
  afterEach(() => vi.useRealTimers());

  it("возле полуночи берёт ЛОКАЛЬНУЮ дату зоны, а не UTC", () => {
    // 2026-06-22 23:00 UTC = 2026-06-23 02:00 МСК (UTC+3).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T23:00:00Z"));
    expect(todayInTimeZone("Europe/Moscow")).toBe("2026-06-23"); // локально уже 23-е
    expect(todayInTimeZone("UTC")).toBe("2026-06-22"); // по UTC ещё 22-е
  });

  it("формат YYYY-MM-DD с ведущими нулями", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T12:00:00Z"));
    expect(todayInTimeZone("UTC")).toBe("2026-03-05");
  });
});

describe("detectTimezone", () => {
  afterEach(() => vi.restoreAllMocks());

  it("возвращает зону из Intl", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Asia/Yekaterinburg" }),
    } as unknown as Intl.DateTimeFormat);
    expect(detectTimezone()).toBe("Asia/Yekaterinburg");
  });

  it("фолбэк на Москву, если Intl бросает", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("no Intl");
    });
    expect(detectTimezone()).toBe(FALLBACK_TIMEZONE);
  });

  it("фолбэк, если зона пустая", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "" }),
    } as unknown as Intl.DateTimeFormat);
    expect(detectTimezone()).toBe(FALLBACK_TIMEZONE);
  });
});
