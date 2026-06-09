// Таблица абитуриентов: поиск, фильтры, сортировка, пагинация, действия.
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  Sigma,
  Loader2,
} from "lucide-react";
import {
  applicantsApi,
  programsApi,
  type ApplicantFilters,
  type ProgramSummary,
} from "@/lib/api";
import type { ApplicantWithProgram, ApplicantStatus } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { STATUS_META, STATUS_OPTIONS, formatDate } from "@/lib/applicant-ui";
import { Button, Input, Select, Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100];

type SortKey = "fullName" | "status" | "totalScore" | "createdAt";

// align: выравнивание; thClass: ширина/выравнивание ячеек.
type ColAlign = "left" | "right" | "center";
const COLUMNS: {
  key: SortKey | null;
  label: string;
  align?: ColAlign;
  thClass?: string;
}[] = [
  { key: "fullName", label: "ФИО", thClass: "min-w-56" },
  { key: null, label: "Программа", thClass: "w-24" },
  { key: "status", label: "Статус", thClass: "w-40" },
  { key: "totalScore", label: "Балл", align: "right", thClass: "w-16" },
  // Узкие центрированные колонки с галочками.
  { key: null, label: "Согл.", align: "center", thClass: "w-14" },
  { key: null, label: "Док.", align: "center", thClass: "w-14" },
  { key: null, label: "Телефон", thClass: "w-32" },
  { key: null, label: "Email", thClass: "w-40" },
  { key: null, label: "Заметки", thClass: "w-28" },
  { key: "createdAt", label: "Дата", thClass: "w-24" },
  { key: null, label: "", thClass: "w-20" },
];

export function ApplicantTable({
  onEdit,
  onCreate,
  refreshKey,
}: {
  onEdit: (applicant: ApplicantWithProgram) => void;
  onCreate: () => void;
  refreshKey?: number;
}) {
  const timezone = useAppStore((s) => s.timezone);

  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [items, setItems] = useState<ApplicantWithProgram[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Фильтры (локальное состояние таблицы).
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [programId, setProgramId] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Debounce поиска (300мс).
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  // Загрузка программ один раз.
  useEffect(() => {
    programsApi.list().then(setPrograms).catch(() => {});
  }, []);

  const filters: ApplicantFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: status || undefined,
      program_id: programId ? Number(programId) : undefined,
      sort_by: sortBy,
      order,
      page,
      limit,
    }),
    [debouncedSearch, status, programId, sortBy, order, page, limit],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await applicantsApi.list(filters);
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Загрузка списка. setLoading — часть паттерна «fetch в эффекте»,
  // данные приходят из внешней системы (API).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setOrder("asc");
    }
    setPage(1);
  };

  const handleDelete = async (a: ApplicantWithProgram) => {
    if (!confirm(`Удалить абитуриента «${a.fullName}»?`)) return;
    setDeletingId(a.id);
    try {
      await applicantsApi.remove(a.id);
      await load();
    } catch {
      alert("Не удалось удалить");
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const sortIcon = (key: SortKey) => {
    if (sortBy !== key) return <ArrowUpDown className="size-3.5 opacity-40" />;
    return order === "asc" ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Абитуриенты</h1>
        <Button onClick={onCreate}>
          <Plus className="size-4" />
          Добавить
        </Button>
      </div>

      {/* Панель управления */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ФИО, email, телефону…"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-48"
        >
          <option value="">Все статусы</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select
          value={programId}
          onChange={(e) => {
            setProgramId(e.target.value);
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">Все программы</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Таблица */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                {COLUMNS.map((col, i) => (
                  <th
                    key={i}
                    className={cn(
                      "px-2.5 py-3 font-medium",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.thClass,
                    )}
                  >
                    {col.key ? (
                      <button
                        onClick={() => toggleSort(col.key!)}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        {col.label}
                        {sortIcon(col.key)}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-16 text-center">
                    <Loader2 className="mx-auto size-7 animate-spin text-emerald-500" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="py-16 text-center text-slate-400"
                  >
                    Ничего не найдено
                  </td>
                </tr>
              ) : (
                items.map((a) => {
                  const meta = STATUS_META[a.status as ApplicantStatus];
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-emerald-50/40"
                    >
                      <td className="px-2.5 py-3 font-medium text-slate-900">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          {a.mathBase != null && (
                            <span
                              title={`База математики: ${a.mathBase}`}
                              className="inline-flex shrink-0"
                            >
                              <Sigma className="size-4 text-rose-600" />
                            </span>
                          )}
                          {a.fullName}
                        </span>
                      </td>
                      <td className="truncate px-2.5 py-3 text-slate-600">
                        {a.program?.name ?? "—"}
                      </td>
                      <td className="px-2.5 py-3">
                        {meta ? (
                          <Badge className={meta.badge}>{meta.label}</Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500">
                            {a.status}
                          </Badge>
                        )}
                      </td>
                      <td className="px-2.5 py-3 text-right font-medium text-slate-900">
                        {a.totalScore != null ? a.totalScore : "—"}
                      </td>
                      <td className="px-2.5 py-3 text-center">
                        {a.consentToEnroll && (
                          <Check className="mx-auto size-4 text-emerald-600" />
                        )}
                      </td>
                      <td className="px-2.5 py-3 text-center">
                        {a.documentsComplete && (
                          <Check className="mx-auto size-4 text-emerald-600" />
                        )}
                      </td>
                      <td className="truncate px-2.5 py-3 text-slate-600">
                        {a.phone ?? "—"}
                      </td>
                      <td className="truncate px-2.5 py-3 text-slate-600">
                        {a.email ?? "—"}
                      </td>
                      <td className="truncate px-2.5 py-3 text-slate-500">
                        {a.notes ? (
                          <span title={a.notes}>{a.notes}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3 text-slate-500">
                        {formatDate(a.createdAt, timezone)}
                      </td>
                      <td className="px-2.5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onEdit(a)}
                            title="Редактировать"
                            className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-emerald-100 hover:text-emerald-700"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(a)}
                            disabled={deletingId === a.id}
                            title="Удалить"
                            className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-rose-100 hover:text-rose-700"
                          >
                            {deletingId === a.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Пагинация */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <span>Показано {from}–{to} из {total}</span>
          <Select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="h-8 w-20"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span>
            Стр. {page} из {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
