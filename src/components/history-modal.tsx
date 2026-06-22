// Модальное окно истории изменений абитуриента.
"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { applicantsApi, programsApi, type ProgramSummary } from "@/lib/api";
import type { HistoryEntry } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { fieldLabel, formatHistoryValue, formatDateTime } from "@/lib/applicant-ui";
import { Modal } from "@/components/ui";

export function HistoryModal({
  open,
  applicantId,
  applicantName,
  onClose,
}: {
  open: boolean;
  applicantId: number | null;
  applicantName: string;
  onClose: () => void;
}) {
  const timezone = useAppStore((s) => s.timezone);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);

  // Карта id→название программы для подмены programId в истории.
  const programNames = useMemo(
    () => new Map(programs.map((p) => [p.id, p.name])),
    [programs],
  );

  // Список программ загружаем один раз при первом открытии.
  useEffect(() => {
    if (!open || programs.length > 0) return;
    programsApi.list().then(setPrograms).catch(() => {});
  }, [open, programs.length]);

  useEffect(() => {
    if (!open || applicantId == null) return;
    let cancelled = false;
    // setLoading — часть паттерна fetch-в-эффекте (данные из внешней системы).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    applicantsApi
      .history(applicantId)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, applicantId]);

  return (
    <Modal open={open} onClose={onClose} title={`История: ${applicantName}`}>
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-7 animate-spin text-emerald-500" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Изменений пока нет
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3 font-medium">Поле</th>
                <th className="py-2 pr-3 font-medium">Изменение</th>
                <th className="py-2 pr-3 font-medium">Кто</th>
                <th className="py-2 font-medium">Когда</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-800">
                    {fieldLabel(e.fieldName)}
                  </td>
                  <td className="py-2 pr-3">
                    {e.fieldName === "created" ? (
                      <span className="font-medium text-emerald-700">
                        Запись создана
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-slate-400 line-through">
                          {formatHistoryValue(e.fieldName, e.oldValue, programNames)}
                        </span>
                        <ArrowRight className="size-3.5 text-slate-400" />
                        <span className="font-medium text-emerald-700">
                          {formatHistoryValue(e.fieldName, e.newValue, programNames)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-slate-600">
                    {e.changedBy.username}
                  </td>
                  <td className="whitespace-nowrap py-2 text-slate-500">
                    {formatDateTime(e.changedAt, timezone)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
