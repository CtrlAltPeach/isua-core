// Вкладка «Программы»: карточки-аналитика.
"use client";
import { AppShell } from "@/components/app-shell";
import { ProgramsView } from "@/components/programs-view";

export default function ProgramsPage() {
  return (
    <AppShell>
      <ProgramsView />
    </AppShell>
  );
}
