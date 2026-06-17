// Глобальное состояние клиента (Zustand).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PublicUser } from "@/lib/types";
import type { ApplicantFilters } from "@/lib/api";
import { FALLBACK_TIMEZONE } from "@/lib/timezone";

interface AuthSlice {
  user: PublicUser | null;
  // "loading" — пока не проверили /me; затем "auth" | "guest".
  authStatus: "loading" | "auth" | "guest";
  setUser: (user: PublicUser | null) => void;
}

interface FilterSlice {
  filters: ApplicantFilters;
  setFilters: (patch: Partial<ApplicantFilters>) => void;
  resetFilters: () => void;
}

interface UiSlice {
  timezone: string;
  // false — зона определена автоматически из браузера (можно переопределять
  // при автоопределении); true — пользователь выбрал зону вручную.
  timezoneManual: boolean;
  // Установить зону вручную (фиксирует выбор: timezoneManual=true).
  setTimezone: (tz: string) => void;
  // Применить автоопределённую зону (только если выбор не зафиксирован вручную).
  applyAutoTimezone: (tz: string) => void;
}

const DEFAULT_FILTERS: ApplicantFilters = {
  search: "",
  status: undefined,
  program_id: undefined,
  sort_by: "createdAt",
  order: "desc",
  page: 1,
  limit: 50,
};

type AppStore = AuthSlice & FilterSlice & UiSlice;

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      // auth
      user: null,
      authStatus: "loading",
      setUser: (user) =>
        set({ user, authStatus: user ? "auth" : "guest" }),

      // filters
      filters: DEFAULT_FILTERS,
      setFilters: (patch) =>
        set((s) => ({ filters: { ...s.filters, ...patch } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),

      // ui
      // SSR-стабильный дефолт; реальная зона подставляется на клиенте
      // (applyAutoTimezone) — иначе hydration mismatch.
      timezone: FALLBACK_TIMEZONE,
      timezoneManual: false,
      setTimezone: (tz) => set({ timezone: tz, timezoneManual: true }),
      applyAutoTimezone: (tz) =>
        set((s) => (s.timezoneManual ? s : { timezone: tz })),
    }),
    {
      name: "isua-ui",
      // Персистим только UI-предпочтения, не auth/filters.
      partialize: (s) => ({
        timezone: s.timezone,
        timezoneManual: s.timezoneManual,
      }),
    },
  ),
);
