// Вкладка «Управление»: программы (CRUD) + массовое удаление абитуриентов.
"use client";
import { AppShell } from "@/components/app-shell";
import { ProgramManager } from "@/components/program-manager";
import { BulkDeleteManager } from "@/components/bulk-delete-manager";

export default function ManagePage() {
  return (
    <AppShell>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Управление</h1>
      <div className="space-y-6">
        <ProgramManager />
        <BulkDeleteManager />
      </div>
    </AppShell>
  );
}
