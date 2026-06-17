// Оболочка защищённых страниц: проверка авторизации + шапка + контейнер.
"use client";
import { useEffect } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Header } from "@/components/header";
import { useAppStore } from "@/lib/store";
import { detectTimezone } from "@/lib/timezone";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Автоопределение таймзоны из браузера (на клиенте, чтобы не было hydration
  // mismatch). Не перезатирает зону, выбранную пользователем вручную.
  const applyAutoTimezone = useAppStore((s) => s.applyAutoTimezone);
  useEffect(() => {
    applyAutoTimezone(detectTimezone());
  }, [applyAutoTimezone]);

  return (
    <AuthGuard>
      <Header />
      {/* pb-24 на <lg — место под фикс. нижнюю панель навигации (h~56px) */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 lg:pb-6">
        {children}
      </main>
    </AuthGuard>
  );
}
