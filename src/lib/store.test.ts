// Тесты логики таймзоны в сторе: авто vs ручной выбор.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/lib/store";
import { FALLBACK_TIMEZONE } from "@/lib/timezone";

describe("store: таймзона авто/ручная", () => {
  beforeEach(() => {
    // Сбросить в исходное состояние перед каждым тестом.
    useAppStore.setState({
      timezone: FALLBACK_TIMEZONE,
      timezoneManual: false,
    });
  });

  it("дефолт — фолбэк-зона, не зафиксирована вручную", () => {
    expect(useAppStore.getState().timezone).toBe(FALLBACK_TIMEZONE);
    expect(useAppStore.getState().timezoneManual).toBe(false);
  });

  it("applyAutoTimezone подставляет зону, пока выбор не ручной", () => {
    useAppStore.getState().applyAutoTimezone("Asia/Yekaterinburg");
    expect(useAppStore.getState().timezone).toBe("Asia/Yekaterinburg");
    expect(useAppStore.getState().timezoneManual).toBe(false);
  });

  it("setTimezone фиксирует ручной выбор", () => {
    useAppStore.getState().setTimezone("Europe/Kaliningrad");
    expect(useAppStore.getState().timezone).toBe("Europe/Kaliningrad");
    expect(useAppStore.getState().timezoneManual).toBe(true);
  });

  it("applyAutoTimezone НЕ перезатирает ручной выбор", () => {
    useAppStore.getState().setTimezone("Europe/Kaliningrad"); // ручной
    useAppStore.getState().applyAutoTimezone("Asia/Yekaterinburg"); // авто
    expect(useAppStore.getState().timezone).toBe("Europe/Kaliningrad");
    expect(useAppStore.getState().timezoneManual).toBe(true);
  });
});
