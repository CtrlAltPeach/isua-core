// Дашборд: карточки метрик за день + таблица конкурса по программам.
"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Sparkles,
  CheckCircle2,
  FileCheck2,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Scale,
  FileDown,
} from "lucide-react";
import { statsApi, type DailyStats } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

function MetricCard({
  icon,
  label,
  value,
  accent,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 p-5",
        accent
          ? "border-emerald-300 bg-emerald-50"
          : "border-slate-200 bg-white",
        onClick && "cursor-pointer transition-shadow hover:shadow-md",
      )}
    >
      <div
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-lg",
          accent ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-700",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </Card>
  );
}

export function Dashboard() {
  const router = useRouter();
  const timezone = useAppStore((s) => s.timezone);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await statsApi.daily(undefined, timezone);
      setStats(data);
    } catch {
      setError("Не удалось загрузить статистику");
    } finally {
      setLoading(false);
    }
  }, [timezone]);

  // Загрузка при монтировании/смене таймзоны. setLoading здесь — намеренная
  // часть паттерна «fetch в эффекте», который правило set-state-in-effect
  // over-flags; данные приходят из внешней системы (API).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const docPercent =
    stats && stats.totalApplicants > 0
      ? Math.round((stats.withDocuments / stats.totalApplicants) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Дашборд</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open("/report", "_blank")}
          >
            <FileDown className="size-4" />
            Отчёт PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Обновить
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </Card>
      )}

      {loading && !stats ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-emerald-500" />
        </div>
      ) : stats ? (
        <>
          {/* Карточки метрик */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={<Users className="size-6" />}
              label="Всего абитуриентов"
              value={stats.totalApplicants}
              onClick={() => router.push("/applicants")}
            />
            <MetricCard
              icon={<Sparkles className="size-6" />}
              label="Новых заявлений сегодня"
              value={stats.newApplications}
              accent
            />
            <MetricCard
              icon={<CheckCircle2 className="size-6" />}
              label="Согласия на зачисление"
              value={stats.withConsent}
              hint={`из ${stats.applied} подавших`}
            />
            <MetricCard
              icon={<FileCheck2 className="size-6" />}
              label="Документы собраны"
              value={`${docPercent}%`}
              hint={`${stats.withDocuments} из ${stats.totalApplicants}`}
            />
          </div>

          {/* Вторая строка метрик: согласия за день, платные, ratio */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={<TrendingUp className="size-6" />}
              label="Новые согласия сегодня"
              value={stats.consentGivenToday}
            />
            <MetricCard
              icon={<TrendingDown className="size-6" />}
              label="Забрали согласие сегодня"
              value={stats.consentWithdrawnToday}
            />
            <MetricCard
              icon={<Wallet className="size-6" />}
              label="Платные абитуриенты"
              value={stats.withPaid}
              hint={
                stats.totalApplicants > 0
                  ? `${Math.round((stats.withPaid / stats.totalApplicants) * 100)}% от всех`
                  : undefined
              }
            />
            <MetricCard
              icon={<Scale className="size-6" />}
              label="Заявлений на место"
              value={stats.applicationsPerPlace?.toFixed(2) ?? "—"}
              hint={`${stats.totalApplications} заявл. / ${stats.totalPlaces} мест · согласий ${stats.consentPerApplication}%`}
            />
          </div>

          {/* Таблица конкурса по программам */}
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
                    <th className="px-5 py-2.5 font-medium">Программа</th>
                    <th className="px-5 py-2.5 text-right font-medium">Мест</th>
                    <th className="px-5 py-2.5 text-right font-medium">Абитур.</th>
                    <th className="px-5 py-2.5 text-right font-medium">Новые сегодня</th>
                    <th className="px-5 py-2.5 text-right font-medium">Конкурс</th>
                    <th className="px-5 py-2.5 text-right font-medium">Ср. балл</th>
                    <th className="px-5 py-2.5 text-right font-medium">Согласия</th>
                    <th className="px-5 py-2.5 text-right font-medium">Документы</th>
                    <th className="px-5 py-2.5 text-right font-medium">Платные</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byProgram.map((p) => (
                    <tr
                      key={p.program}
                      className="border-b border-slate-100 last:border-0 hover:bg-emerald-50/40"
                    >
                      <td className="px-5 py-2.5 font-medium text-slate-900">
                        {p.program}
                      </td>
                      <td className="px-5 py-2.5 text-right text-slate-600">
                        {p.places}
                      </td>
                      <td className="px-5 py-2.5 text-right text-slate-600">
                        {p.applicants}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {p.newToday > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            +{p.newToday}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right">
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
                      <td className="px-5 py-2.5 text-right text-slate-600">
                        {p.avgScore?.toFixed(1) ?? "—"}
                      </td>
                      <td className="px-5 py-2.5 text-right text-slate-600">
                        {p.withConsent}
                      </td>
                      <td className="px-5 py-2.5 text-right text-slate-600">
                        {p.withDocuments}
                      </td>
                      <td className="px-5 py-2.5 text-right text-slate-600">
                        {p.withPaid}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Новые заявления сегодня по программам */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  <Sparkles className="size-4 text-emerald-600" />
                  Новые заявления сегодня
                </h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-bold text-emerald-700">
                  всего +{stats.newApplications}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {stats.byProgram.map((p) => (
                  <div
                    key={p.program}
                    className="flex items-center justify-between px-5 py-2.5"
                  >
                    <span className="text-slate-700">{p.program}</span>
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        p.newToday > 0 ? "text-emerald-700" : "text-slate-400",
                      )}
                    >
                      {p.newToday > 0 ? `+${p.newToday}` : "0"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Согласия / укомплектованность мест */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Согласия / места
                </h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-bold text-emerald-700">
                  всего {stats.withConsent}
                </span>
              </div>
              <div className="space-y-3 px-5 py-4">
                {stats.byProgram.map((p) => (
                  <div key={p.program}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-slate-700">{p.program}</span>
                      <span className="text-slate-500">
                        <span className="font-semibold text-emerald-700">
                          {p.withConsent}
                        </span>{" "}
                        / {p.places} мест ({p.consentFillPercent}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${Math.min(100, p.consentFillPercent)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Сводка по статусам */}
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                label: "Подали заявление",
                value: stats.applied,
                color: "text-emerald-700",
              },
              {
                label: "Забрали заявление",
                value: stats.withdrawn,
                color: "text-rose-700",
              },
            ].map((s) => (
              <Card key={s.label} className="p-4 text-center">
                <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                <p className="text-sm text-slate-500">{s.label}</p>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
