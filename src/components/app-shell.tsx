// Оболочка защищённых страниц: проверка авторизации + шапка + контейнер.
"use client";
import { AuthGuard } from "@/components/auth-guard";
import { Header } from "@/components/header";

export function AppShell({ children }: { children: React.ReactNode }) {
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
