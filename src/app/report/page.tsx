// Печатная страница отчёта (дневная статистика + рейтинг по программам).
// Открывается отдельно; кнопка «Печать / Сохранить PDF» вызывает window.print().
"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import {
  statsApi,
  applicantsApi,
  type DailyStats,
} from "@/lib/api";
import type { ApplicantWithProgram } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { formatDate } from "@/lib/applicant-ui";

export default function ReportPage() {
  const timezone = useAppStore((s) => s.timezone);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [byProgram, setByProgram] = useState<
    { program: string; rows: ApplicantWithProgram[] }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [timezone]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loading || !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  // Показывать заголовки групп, если есть хотя бы одна реальная группа.
  const showGroupHeaders = !(
    stats.byGroup.length === 1 && stats.byGroup[0].groupId === null
  );

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-slate-900">
      {/* Панель действий — скрывается при печати */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <button
          onClick={() => window.history.back()}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Назад
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          <Printer className="size-4" />
          Печать / Сохранить PDF
        </button>
      </div>

      {/* Заголовок отчёта */}
      <div className="mb-6 border-b-2 border-slate-800 pb-3">
        <h1 className="text-2xl font-bold">
          Отчёт о приёме абитуриентов
        </h1>
        <p className="text-sm text-slate-600">
          Дата: {formatDate(new Date(), timezone)} · Зона: {stats.timezone}
        </p>
      </div>

      {/* Общая статистика */}
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Общая статистика</h2>
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Всего абитуриентов", stats.totalApplicants],
              ["Новых заявлений сегодня", stats.newApplications],
              ["Подали заявление", stats.applied],
              ["Забрали заявление", stats.withdrawn],
              ["Согласий на зачисление", stats.withConsent],
              ["Документы собраны", stats.withDocuments],
              ["Платные абитуриенты", stats.withPaid],
              ["Дистанционно", stats.withDistant],
              [
                "Заявлений на место",
                stats.applicationsPerPlace?.toFixed(2) ?? "—",
              ],
            ].map(([label, value]) => (
              <tr key={String(label)} className="border-b border-slate-200">
                <td className="py-1.5 text-slate-600">{label}</td>
                <td className="py-1.5 text-right font-medium">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Конкурс по программам */}
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Конкурс по программам</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-400 text-left">
              <th className="py-1.5">Программа</th>
              <th className="py-1.5 text-right">Мест</th>
              <th className="py-1.5 text-right">Абитур.</th>
              <th className="py-1.5 text-right">Конкурс</th>
              <th className="py-1.5 text-right">Ср. балл</th>
              <th className="py-1.5 text-right">Согласия</th>
              <th className="py-1.5 text-right">Платные</th>
              <th className="py-1.5 text-right">Дистант</th>
            </tr>
          </thead>
          <tbody>
            {stats.byGroup.map((g) => (
              <Fragment key={g.groupId ?? "none"}>
                {showGroupHeaders && (
                  <tr className="border-b border-slate-300 bg-slate-100">
                    <td
                      colSpan={8}
                      className="py-1 font-semibold text-slate-700"
                    >
                      {g.groupName ?? "Без группы"}
                    </td>
                  </tr>
                )}
                {g.programs.map((p) => (
                  <tr key={p.program} className="border-b border-slate-200">
                    <td className="py-1.5 font-medium">{p.program}</td>
                    <td className="py-1.5 text-right">{p.places}</td>
                    <td className="py-1.5 text-right">{p.applicants}</td>
                    <td className="py-1.5 text-right">
                      {p.competition?.toFixed(2) ?? "—"}
                    </td>
                    <td className="py-1.5 text-right">
                      {p.avgScore?.toFixed(1) ?? "—"}
                    </td>
                    <td className="py-1.5 text-right">{p.withConsent}</td>
                    <td className="py-1.5 text-right">{p.withPaid}</td>
                    <td className="py-1.5 text-right">{p.withDistant}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      {/* Рейтинг по программам */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Рейтинг по программам</h2>
        {byProgram.map(({ program, rows }) => (
          <div key={program} className="mb-5 break-inside-avoid">
            <h3 className="mb-1 font-semibold text-emerald-700">{program}</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-400 text-left">
                  <th className="py-1">№</th>
                  <th className="py-1">ФИО</th>
                  <th className="py-1 text-right">Балл</th>
                  <th className="py-1 text-center">Согл.</th>
                  <th className="py-1 text-center">Док.</th>
                  <th className="py-1">Паспорт</th>
                  <th className="py-1 text-center">Метки</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-1">{i + 1}</td>
                    <td className="py-1">{a.fullName}</td>
                    <td className="py-1 text-right font-medium">
                      {a.totalScore ?? "—"}
                    </td>
                    <td className="py-1 text-center">
                      {a.consentToEnroll ? "✓" : ""}
                    </td>
                    <td className="py-1 text-center">
                      {a.documentsComplete ? "✓" : ""}
                    </td>
                    <td className="py-1">
                      {a.passportSeries || a.passportNumber
                        ? `${a.passportSeries ?? ""} ${a.passportNumber ?? ""}`.trim()
                        : "—"}
                    </td>
                    <td className="py-1 text-center">
                      {[
                        a.mathBase != null ? "Б" : "",
                        a.specialQuota ? "ОК" : "",
                        a.specialRight ? "ОП" : "",
                        a.isPaid ? "П" : "",
                        a.isDistant ? "Д" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}
