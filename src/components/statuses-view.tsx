// Вкладка «Статусы»: Kanban-доска (2 колонки) + редактирование по клику.
"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, Pencil } from "lucide-react";
import { applicantsApi } from "@/lib/api";
import type { ApplicantWithProgram, ApplicantStatus } from "@/lib/types";
import { ApplicantFormModal } from "@/components/applicant-form-modal";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

const COLUMNS: {
  status: ApplicantStatus;
  title: string;
  header: string;
  border: string;
}[] = [
  {
    status: "applied",
    title: "Подал заявление",
    header: "bg-emerald-600 text-white",
    border: "border-emerald-200",
  },
  {
    status: "withdrawn",
    title: "Забрал заявление",
    header: "bg-rose-600 text-white",
    border: "border-rose-200",
  },
];

export function StatusesView() {
  const [items, setItems] = useState<ApplicantWithProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ApplicantWithProgram | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await applicantsApi.list({
        sort_by: "totalScore",
        order: "desc",
        limit: 100,
      });
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const openEdit = (a: ApplicantWithProgram) => {
    setEditing(a);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Статусы</h1>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {COLUMNS.map((col) => {
          const cards = items.filter((a) => a.status === col.status);
          return (
            <div
              key={col.status}
              className={cn(
                "overflow-hidden rounded-xl border bg-slate-50",
                col.border,
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-between px-4 py-2.5 font-semibold",
                  col.header,
                )}
              >
                <span>{col.title}</span>
                <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-sm">
                  {cards.length}
                </span>
              </div>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
                {cards.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    Нет абитуриентов
                  </p>
                ) : (
                  cards.map((a) => (
                    <StatusCard key={a.id} a={a} onEdit={() => openEdit(a)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ApplicantFormModal
        open={modalOpen}
        applicant={editing}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </div>
  );
}

function StatusCard({
  a,
  onEdit,
}: {
  a: ApplicantWithProgram;
  onEdit: () => void;
}) {
  return (
    <Card
      onClick={onEdit}
      className="cursor-pointer p-3 transition-shadow hover:shadow-md"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="font-medium text-slate-900">{a.fullName}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Редактировать"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-100 hover:text-emerald-700"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{a.program?.name ?? "—"}</span>
        <span className="font-semibold text-slate-900">
          {a.totalScore ?? "—"}
        </span>
      </div>
      <div className="mt-2 flex gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          Согласие
          {a.consentToEnroll ? (
            <Check className="size-3.5 text-emerald-600" />
          ) : (
            <span className="text-rose-400">✗</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1">
          Документы
          {a.documentsComplete ? (
            <Check className="size-3.5 text-emerald-600" />
          ) : (
            <span className="text-rose-400">✗</span>
          )}
        </span>
      </div>
    </Card>
  );
}
