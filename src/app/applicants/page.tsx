// Вкладка «Абитуриенты»: таблица + модальная форма add/edit.
"use client";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ApplicantTable } from "@/components/applicant-table";
import { ApplicantFormModal } from "@/components/applicant-form-modal";
import type { ApplicantWithProgram } from "@/lib/types";

export default function ApplicantsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApplicantWithProgram | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (a: ApplicantWithProgram) => {
    setEditing(a);
    setModalOpen(true);
  };
  const onSaved = () => setRefreshKey((k) => k + 1);

  return (
    <AppShell>
      <ApplicantTable
        onCreate={openCreate}
        onEdit={openEdit}
        refreshKey={refreshKey}
      />
      <ApplicantFormModal
        open={modalOpen}
        applicant={editing}
        onClose={() => setModalOpen(false)}
        onSaved={onSaved}
      />
    </AppShell>
  );
}
