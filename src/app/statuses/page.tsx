// Вкладка «Статусы» (каркас — Kanban в фазе 4).
"use client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";

export default function StatusesPage() {
  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold text-slate-900">Статусы</h1>
      <Card className="p-6 text-sm text-slate-500">
        Kanban-доска по статусам появится здесь.
      </Card>
    </AppShell>
  );
}
