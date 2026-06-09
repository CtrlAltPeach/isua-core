// Вкладка «Программы» (каркас — карточки в фазе 4).
"use client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";

export default function ProgramsPage() {
  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold text-slate-900">Программы</h1>
      <Card className="p-6 text-sm text-slate-500">
        Карточки программ появятся здесь.
      </Card>
    </AppShell>
  );
}
