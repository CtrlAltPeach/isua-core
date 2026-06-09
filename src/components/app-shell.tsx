// Оболочка защищённых страниц: проверка авторизации + шапка + контейнер.
"use client";
import { AuthGuard } from "@/components/auth-guard";
import { Header } from "@/components/header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {children}
      </main>
    </AuthGuard>
  );
}
