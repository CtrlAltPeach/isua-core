// Печатная страница отчёта (дневная статистика + рейтинг по программам).
// Открывается отдельно; кнопка «Печать / Сохранить PDF» вызывает window.print().
"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Printer,
  Users,
  Sparkles,
  CheckCircle2,
  FileCheck2,
  Wallet,
  Laptop,
  Scale,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  statsApi,
  applicantsApi,
  type DailyStats,
} from "@/lib/api";
import type { ApplicantWithProgram } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { formatDate } from "@/lib/applicant-ui";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AuthGuard } from "@/components/auth-guard";

// Мини-карточка метрики в стиле дашборда (иконка-тайл + крупное значение).
function MetricItem({
  icon,
  label,
  value,
  accent,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-4",
        accent
          ? "border-emerald-300 bg-emerald-50"
          : "border-slate-200 bg-white",
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          accent
            ? "bg-emerald-600 text-white"
            : "bg-emerald-100 text-emerald-700",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

// Цветные бейджи маркеров (зеркало <Markers> из applicant-table, без заметок/З).
function ReportMarkers({ a }: { a: ApplicantWithProgram }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-1">
      {a.mathBase != null && (
        <span
          title={`База математики: ${a.mathBase}`}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-red-50 text-xs font-bold text-red-600"
        >
          Б
        </span>
      )}
      {a.specialQuota && (
        <span
          title="Отдельная квота"
          className="inline-flex h-5 shrink-0 items-center justify-center rounded bg-amber-50 px-1 text-xs font-bold text-amber-700"
        >
          ОК
        </span>
      )}
      {a.specialRight && (
        <span
          title="Особая квота/право"
          className="inline-flex h-5 shrink-0 items-center justify-center rounded bg-amber-50 px-1 text-xs font-bold text-amber-700"
        >
          ОКП
        </span>
      )}
      {a.isPaid && (
        <span
          title="Платное обучение"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-500"
        >
          П
        </span>
      )}
      {a.isDistant && (
        <span
          title="Дистанционное обучение"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-indigo-50 text-xs font-bold text-indigo-600"
        >
          Д
        </span>
      )}
    </span>
  );
}

export default function ReportPage() {
  const timezone = useAppStore((s) => s.timezone);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [byProgram, setByProgram] = useState<
    { program: string; rows: ApplicantWithProgram[] }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, list] = await Promise.all([
        statsApi.daily(undefined, timezone),
        applicantsApi.list({
          sort_by: "totalScore",
          order: "desc",
          limit: 100,
        }),
      ]);
      setStats(s);
      // Группируем абитуриентов по программе (уже отсортированы по баллу).
      const map = new Map<string, ApplicantWithProgram[]>();
      for (const a of list.items) {
        const name = a.program?.name ?? "—";
        if (!map.has(name)) map.set(name, []);
        map.get(name)!.push(a);
      }
      setByProgram(
        [...map.entries()].map(([program, rows]) => ({ program, rows })),
      );
    } catch {
      setError("Не удалось загрузить данные отчёта.");
    } finally {
      setLoading(false);
    }
  }, [timezone]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-50 print:bg-white">
        <div className="mx-auto max-w-4xl space-y-6 bg-slate-50 p-4 text-slate-900 print:max-w-none print:bg-white print:p-0 sm:p-8">
          {/* Панель действий — скрывается при печати */}
          <div className="flex items-center justify-between print:hidden">
            <button
              onClick={() => window.history.back()}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              ← Назад
            </button>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              Печать / Сохранить PDF
            </Button>
          </div>

          {loading && !stats ? (
            <div className="flex justify-center py-20">
              <Loader2 className="size-8 animate-spin text-emerald-500" />
            </div>
          ) : error ? (
            <Card className="border-rose-200 bg-rose-50 p-6">
              <p className="mb-4 text-sm text-rose-700">{error}</p>
              <Button variant="secondary" size="sm" onClick={load}>
                <RefreshCw className="size-4" />
                Повторить
              </Button>
            </Card>
          ) : stats ? (
            <>
              {/* Заголовок отчёта */}
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Отчёт о приёме абитуриентов
                </h1>
                <p className="text-sm text-slate-500">
                  Дата: {formatDate(new Date(), timezone)} · Зона: {stats.timezone}
                </p>
              </div>

              {/* Общая статистика — сетка метрик */}
              <section>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <MetricItem
                    icon={<Users className="size-5" />}
                    label="Всего абитуриентов"
                    value={stats.totalApplicants}
                    accent
                  />
                  <MetricItem
                    icon={<Sparkles className="size-5" />}
                    label="Новых сегодня"
                    value={stats.newApplications}
                  />
                  <MetricItem
                    icon={<CheckCircle2 className="size-5" />}
                    label="Согласий на зачисление"
                    value={stats.withConsent}
                  />
                  <MetricItem
                    icon={<FileCheck2 className="size-5" />}
                    label="Документы собраны"
                    value={stats.withDocuments}
                  />
                  <MetricItem
                    icon={<Wallet className="size-5" />}
                    label="Платные"
                    value={stats.withPaid}
                  />
                  <MetricItem
                    icon={<Laptop className="size-5" />}
                    label="Дистанционно"
                    value={stats.withDistant}
                  />
                  <MetricItem
                    icon={<Scale className="size-5" />}
                    label="Заявлений на место"
                    value={stats.applicationsPerPlace?.toFixed(2) ?? "—"}
                  />
                </div>
              </section>

              {/* Конкурс по программам */}
              <Card className="overflow-hidden">
                <div className="border-b border-slate-200 px-5 py-3">
                  <h2 className="font-semibold text-slate-900">
                    Конкурс по программам
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                        <th className="px-4 py-2 font-medium">Программа</th>
                        <th className="px-4 py-2 text-right font-medium">Мест</th>
                        <th className="px-4 py-2 text-right font-medium">
                          Абитур.
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Конкурс
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Ср. балл
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Согласия
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Платные
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          Дистант
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const showGroupHeaders = !(
                          stats.byGroup.length === 1 &&
                          stats.byGroup[0].groupId === null
                        );
                        return stats.byGroup.map((g) => (
                          <Fragment key={g.groupId ?? "none"}>
                            {showGroupHeaders && (
                              <tr className="bg-slate-50">
                                <td
                                  colSpan={8}
                                  className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                                >
                                  {g.groupName ?? "Без группы"}
                                </td>
                              </tr>
                            )}
                            {g.programs.map((p) => (
                              <tr
                                key={p.program}
                                className="border-b border-slate-100 last:border-0"
                              >
                                <td className="px-4 py-2 font-medium text-slate-900">
                                  {p.program}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-600">
                                  {p.places}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-600">
                                  {p.applicants}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <span
                                    className={cn(
                                      "font-medium",
                                      p.competition && p.competition >= 1
                                        ? "text-emerald-700"
                                        : "text-slate-500",
                                    )}
                                  >
                                    {p.competition?.toFixed(2) ?? "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-slate-600">
                                  {p.avgScore?.toFixed(1) ?? "—"}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-600">
                                  {p.withConsent}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-600">
                                  {p.withPaid}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-600">
                                  {p.withDistant}
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Рейтинг по программам */}
              <Card className="overflow-hidden">
                <div className="border-b border-slate-200 px-5 py-3">
                  <h2 className="font-semibold text-slate-900">
                    Рейтинг по программам
                  </h2>
                </div>
                <div className="space-y-5 p-5">
                  {byProgram.map(({ program, rows }) => (
                    <div key={program} className="break-inside-avoid">
                      <h3 className="mb-2 font-semibold text-emerald-700">
                        {program}
                      </h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                            <th className="px-3 py-2 font-medium">№</th>
                            <th className="px-3 py-2 font-medium">ФИО</th>
                            <th className="px-3 py-2 text-right font-medium">
                              Балл
                            </th>
                            <th className="px-3 py-2 text-center font-medium">
                              Согл.
                            </th>
                            <th className="px-3 py-2 text-center font-medium">
                              Док.
                            </th>
                            <th className="px-3 py-2 text-center font-medium">
                              Метки
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((a, i) => (
                            <tr
                              key={a.id}
                              className="border-b border-slate-100 last:border-0"
                            >
                              <td className="px-3 py-2 text-slate-500">
                                {i + 1}
                              </td>
                              <td className="px-3 py-2 font-medium text-slate-900">
                                {a.fullName}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900">
                                {a.totalScore ?? "—"}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {a.consentToEnroll ? (
                                  <Check className="mx-auto size-4 stroke-3 text-emerald-600" />
                                ) : (
                                  <span className="font-bold text-red-400">✗</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {a.documentsComplete ? (
                                  <Check className="mx-auto size-4 stroke-3 text-emerald-600" />
                                ) : (
                                  <span className="font-bold text-red-400">✗</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <ReportMarkers a={a} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </AuthGuard>
  );
}
