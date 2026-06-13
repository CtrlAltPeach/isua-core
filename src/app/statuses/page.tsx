// Вкладка «Статусы»: Kanban-доска.
"use client";
import { AppShell } from "@/components/app-shell";
import { StatusesView } from "@/components/statuses-view";

export default function StatusesPage() {
  return (
    <AppShell>
      <StatusesView />
    </AppShell>
  );
}
