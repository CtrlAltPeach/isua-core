// Вкладка «Управление» (только admin): пользователи, программы (CRUD),
// массовое удаление абитуриентов.
"use client";
import { AppShell } from "@/components/app-shell";
import { ProgramManager } from "@/components/program-manager";
import { ProgramGroupManager } from "@/components/program-group-manager";
import { BulkDeleteManager } from "@/components/bulk-delete-manager";
import { UserManager } from "@/components/user-manager";
import { useAuth } from "@/hooks/useAuth";

export default function ManagePage() {
  const { user } = useAuth();

  // Доступ только для админа (operator перенаправляется сообщением).
  if (user && user.role !== "admin") {
    return (
      <AppShell>
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-6 py-8 text-center text-amber-800">
          <p className="text-lg font-semibold">Недостаточно прав</p>
          <p className="mt-1 text-sm">
            Раздел «Управление» доступен только администраторам.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Управление</h1>
      <div className="space-y-6">
        <UserManager />
        <ProgramGroupManager />
        <ProgramManager />
        <BulkDeleteManager />
      </div>
    </AppShell>
  );
}
