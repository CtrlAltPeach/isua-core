// Глобальное состояние клиента (Zustand).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PublicUser } from "@/lib/types";
import type { ApplicantFilters } from "@/lib/api";

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
  setTimezone: (tz: string) => void;
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
      timezone: "Europe/Moscow",
      setTimezone: (tz) => set({ timezone: tz }),
    }),
    {
      name: "isua-ui",
      // Персистим только UI-предпочтения, не auth/filters.
      partialize: (s) => ({ timezone: s.timezone }),
    },
  ),
);
