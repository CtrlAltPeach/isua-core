// Вкладка «Программы»: карточки-аналитика по каждой программе.
"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, Users } from "lucide-react";
import { programsApi, type ProgramStatRow } from "@/lib/api";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export function ProgramsView() {
  const router = useRouter();
  const [byProgram, setByProgram] = useState<ProgramStatRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await programsApi.stats();
      setByProgram(data.byProgram);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loading || !byProgram) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Программы</h1>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {byProgram.map((p) => (
          <ProgramCard
            key={p.programId}
            p={p}
            onOpen={() => router.push(`/applicants?program=${p.programId}`)}
          />
        ))}
      </div>
    </div>
  );
}

function ProgramCard({
  p,
  onOpen,
}: {
  p: ProgramStatRow;
  onOpen: () => void;
}) {
  // Заполненность мест согласиями (укомплектованность).
  const fill = Math.min(100, p.consentFillPercent);

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-emerald-700">{p.program}</h2>
        <span className="text-sm text-slate-400">
          {p.applicants} / {p.places} мест
        </span>
      </div>

      {/* Ключевые цифры */}
      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Конкурс" value={p.competition?.toFixed(2) ?? "—"} />
        <Metric label="Средний балл" value={p.avgScore?.toFixed(1) ?? "—"} />
        <Metric label="Согласий" value={p.withConsent} />
        <Metric label="Документы" value={p.withDocuments} />
      </div>

      {/* Прогресс-бар укомплектованности согласиями */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>Согласий от мест</span>
          <span>{p.consentFillPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${fill}%` }}
          />
        </div>
      </div>

      {/* Разбивка по статусам */}
      <div className="mb-4 flex gap-2 text-xs">
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-700">
          Подали: {p.applied}
        </span>
        <span className="rounded-full bg-rose-100 px-2.5 py-0.5 font-medium text-rose-700">
          Забрали: {p.withdrawn}
        </span>
        {p.withPaid > 0 && (
          <span className="rounded-full bg-slate-200 px-2.5 py-0.5 font-medium text-slate-600">
            Платных: {p.withPaid}
          </span>
        )}
        {p.withDistant > 0 && (
          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 font-medium text-sky-700">
            Дистант: {p.withDistant}
          </span>
        )}
      </div>

      <Button variant="secondary" size="sm" onClick={onOpen} className="w-full">
        <Users className="size-4" />
        Все абитуриенты
        <ArrowRight className="size-4" />
      </Button>
    </Card>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className={cn("rounded-md bg-slate-50 px-3 py-2")}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
