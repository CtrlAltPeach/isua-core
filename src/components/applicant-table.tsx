// Таблица абитуриентов: поиск, фильтры, сортировка, пагинация, действия.
"use client";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Search,
  Plus,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightSmall,
  CalendarDays,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  AlertTriangle,
  StickyNote,
  Loader2,
} from "lucide-react";
import {
  applicantsApi,
  programsApi,
  type ApplicantFilters,
  type ProgramSummary,
} from "@/lib/api";
import { useSearchParams } from "next/navigation";
import type { ApplicantWithProgram, ApplicantStatus } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import {
  STATUS_META,
  STATUS_OPTIONS,
  formatDate,
  formatTime,
} from "@/lib/applicant-ui";
import { failingSubjects } from "@/lib/thresholds";
import { Button, Input, Select, Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100];

type SortKey = "fullName" | "status" | "totalScore" | "createdAt";

// align: выравнивание; thClass: ширина/выравнивание ячеек.
type ColAlign = "left" | "right" | "center";
// Главные колонки таблицы. Детальные поля (гражданство, паспорт, контакты,
// заметка) вынесены в раскрывающуюся строку-деталь (7D) — так таблица узкая
// и помещается без горизонтального скролла.
const COLUMNS: {
  key: SortKey | null;
  label: string;
  align?: ColAlign;
  thClass?: string;
}[] = [
  // Колонка-шеврон раскрытия деталей.
  { key: null, label: "", thClass: "w-9" },
  // ФИО забирает остаток ширины (w-auto) — растягивается на широком экране,
  // имя влезает полностью; сверхдлинные обрезаются многоточием с title.
  { key: "fullName", label: "ФИО", thClass: "w-auto" },
  { key: null, label: "Программа", thClass: "w-28" },
  { key: "status", label: "Статус", thClass: "w-28" },
  { key: "totalScore", label: "Балл", align: "right", thClass: "w-16" },
  // Узкие центрированные колонки с галочками.
  { key: null, label: "Согл.", align: "center", thClass: "w-16" },
  { key: null, label: "Док.", align: "center", thClass: "w-16" },
  { key: null, label: "Телефон", thClass: "w-36" },
  { key: "createdAt", label: "Дата", thClass: "w-24" },
  // Колонка действий — фиксированная узкая ширина.
  { key: null, label: "", thClass: "w-12" },
];

// Пара «подпись/значение» в раскрытой строке-детали.
function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value ? value : "—"}</dd>
    </div>
  );
}

export function ApplicantTable({
  onEdit,
  onCreate,
  onHistory,
  refreshKey,
}: {
  onEdit: (applicant: ApplicantWithProgram) => void;
  onCreate: () => void;
  onHistory: (applicant: ApplicantWithProgram) => void;
  refreshKey?: number;
}) {
  const timezone = useAppStore((s) => s.timezone);
  const searchParams = useSearchParams();
  // Начальный фильтр по программе из query (?program=ID) — переход с карточек.
  const initialProgram = searchParams.get("program") ?? "";

  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [items, setItems] = useState<ApplicantWithProgram[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Группировка по дням (свёртываемые разделители).
  const [groupByDay, setGroupByDay] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  // Раскрытые строки-детали (id абитуриентов).
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const toggleRow = (id: number) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Фильтры (локальное состояние таблицы).
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [programId, setProgramId] = useState<string>(initialProgram);
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

  // silent=true — фоновое обновление (polling): не показываем спиннер и не
  // сбрасываем строки при ошибке, чтобы не мигать таблицей под пользователем.
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await applicantsApi.list(filters);
        setItems(res.items);
        setTotal(res.total);
      } catch {
        if (!silent) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [filters],
  );

  // Загрузка списка. setLoading — часть паттерна «fetch в эффекте»,
  // данные приходят из внешней системы (API).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  // Авто-обновление (7F): тихий polling раз в 20 сек, чтобы видеть изменения
  // других пользователей. Не трогает спиннер и не сбивает ввод поиска.
  useEffect(() => {
    const id = setInterval(() => void load(true), 20_000);
    return () => clearInterval(id);
  }, [load]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setOrder("asc");
    }
    setPage(1);
  };

  // Удаление вынесено в отдельный интерфейс (см. бэклог) — из строки убрано.

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

  // Группировка текущей страницы записей по дате создания (в выбранной зоне).
  const WEEKDAYS = [
    "Воскресенье",
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
  ];
  const dayGroups = (() => {
    const map = new Map<string, ApplicantWithProgram[]>();
    for (const a of items) {
      const key = formatDate(a.createdAt, timezone); // dd.MM.yyyy
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()].map(([date, rows]) => {
      const wd = WEEKDAYS[new Date(rows[0].createdAt).getDay()];
      return { date, weekday: wd, rows };
    });
  })();

  const toggleDay = (date: string) =>
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const colCount = COLUMNS.length;

  const renderRow = (a: ApplicantWithProgram) => {
    const meta = STATUS_META[a.status as ApplicantStatus];
    // Предметы ниже порога программы (для значка-предупреждения у балла).
    const prog = programs.find((p) => p.id === a.programId);
    const failing = prog?.minScores
      ? failingSubjects(a, prog.minScores)
      : [];
    const expanded = expandedRows.has(a.id);
    return (
      <Fragment key={a.id}>
      <tr
        onClick={() => onEdit(a)}
        className="cursor-pointer border-b border-slate-100 hover:bg-emerald-50/40"
      >
        {/* Шеврон раскрытия деталей (клик не открывает редактирование) */}
        <td className="px-1 py-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleRow(a.id);
            }}
            title={expanded ? "Свернуть детали" : "Показать детали"}
            className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRightSmall className="size-4" />
            )}
          </button>
        </td>
        <td className="px-2.5 py-3 font-medium text-slate-900">
          <span className="flex items-center gap-1.5">
            {/* ФИО влезает полностью (колонка w-auto); сверхдлинное —
                обрезается многоточием, полное имя по наведению (title). */}
            <span className="min-w-0 truncate" title={a.fullName}>
              {a.fullName}
            </span>
            {a.mathBase != null && (
              <span
                title={`База математики: ${a.mathBase}`}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-rose-100 text-xs font-bold text-rose-700"
              >
                Б
              </span>
            )}
            {a.specialQuota && (
              <span
                title="Особая квота"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-orange-100 text-xs font-bold text-orange-700"
              >
                О
              </span>
            )}
            {a.isPaid && (
              <span
                title="Платное обучение"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-slate-200 text-xs font-bold text-slate-600"
              >
                П
              </span>
            )}
            {a.notes && (
              <span
                title={a.notes}
                className="inline-flex shrink-0 text-amber-500"
              >
                <StickyNote className="size-3.5" />
              </span>
            )}
          </span>
        </td>
        <td className="truncate px-2.5 py-3 text-slate-600">
          {a.program?.name ?? "—"}
        </td>
        <td className="px-2.5 py-3">
          {meta ? (
            <Badge className={meta.badge}>{meta.label}</Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-500">{a.status}</Badge>
          )}
        </td>
        <td className="px-2.5 py-3 text-right font-medium text-slate-900">
          <span className="inline-flex items-center justify-end gap-1">
            {failing.length > 0 && (
              <span
                className="inline-flex"
                title={`Ниже порога: ${failing
                  .map((f) => `${f.field} ${f.value}<${f.min}`)
                  .join(", ")}`}
              >
                <AlertTriangle className="size-3.5 text-amber-500" />
              </span>
            )}
            {a.totalScore != null ? a.totalScore : "—"}
          </span>
        </td>
        <td className="px-2.5 py-3 text-center">
          {a.consentToEnroll ? (
            <Check className="mx-auto size-5 stroke-[3] text-emerald-600" />
          ) : (
            <span className="font-bold text-rose-400">✗</span>
          )}
        </td>
        <td className="px-2.5 py-3 text-center">
          {a.documentsComplete ? (
            <Check className="mx-auto size-5 stroke-[3] text-emerald-600" />
          ) : (
            <span className="font-bold text-rose-400">✗</span>
          )}
        </td>
        <td className="truncate px-2.5 py-3 text-slate-600" title={a.phone ?? ""}>
          {a.phone ?? "—"}
        </td>
        <td className="whitespace-nowrap px-2.5 py-3 text-slate-500">
          <div className="leading-tight">
            <div>{formatDate(a.createdAt, timezone)}</div>
            <div className="text-xs text-slate-400">
              {formatTime(a.createdAt, timezone)}
            </div>
          </div>
        </td>
        <td className="px-1 py-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onHistory(a);
            }}
            title="История изменений"
            className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-emerald-100 hover:text-emerald-700"
          >
            <Clock className="size-4" />
          </button>
        </td>
      </tr>
      {/* Строка-деталь: гражданство, паспорт, контакты, заметка (7D). */}
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td />
          <td colSpan={colCount - 1} className="px-2.5 pb-3 pt-1">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
              <Detail label="Гражданство" value={a.citizenship} />
              <Detail
                label="Документ об образовании"
                value={
                  a.documentType === "diploma"
                    ? "Диплом"
                    : a.documentType === "certificate"
                      ? "Аттестат"
                      : null
                }
              />
              <Detail
                label="Паспорт"
                value={
                  a.passportSeries || a.passportNumber
                    ? `${a.passportSeries ?? ""} ${a.passportNumber ?? ""}`.trim()
                    : null
                }
              />
              <Detail label="СНИЛС" value={a.snils} />
              <Detail label="ИНН" value={a.inn} />
              <Detail label="Прописка" value={a.registrationAddress} />
              <Detail label="Email" value={a.email} />
              {a.notes && (
                <div className="col-span-2 sm:col-span-4">
                  <dt className="text-xs font-medium text-slate-400">Заметка</dt>
                  <dd className="whitespace-pre-wrap text-slate-700">
                    {a.notes}
                  </dd>
                </div>
              )}
            </dl>
          </td>
        </tr>
      )}
      </Fragment>
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
        <Button
          variant={groupByDay ? "primary" : "secondary"}
          size="sm"
          onClick={() => setGroupByDay((v) => !v)}
          title="Группировать по дням добавления"
        >
          <CalendarDays className="size-4" />
          По дням
        </Button>
      </div>

      {/* Таблица — область фикс-высоты: шапка закреплена (sticky),
          вертикальный и горизонтальный скролл внутри этой области. */}
      <Card className="overflow-hidden">
        <div className="max-h-[calc(100vh-19rem)] overflow-auto">
          <table className="w-full min-w-[50rem] table-fixed text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                {COLUMNS.map((col, i) => (
                  <th
                    key={i}
                    className={cn(
                      "sticky top-0 z-10 bg-slate-50 px-2.5 py-3 font-medium",
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
              ) : groupByDay ? (
                // Группировка по дням: заголовок-разделитель + (свёрнуто/раскрыто).
                dayGroups.map((g) => {
                  const collapsed = collapsedDays.has(g.date);
                  return (
                    <Fragment key={g.date}>
                      <tr
                        className="cursor-pointer border-b border-slate-200 bg-slate-50 hover:bg-emerald-50"
                        onClick={() => toggleDay(g.date)}
                      >
                        <td
                          colSpan={colCount}
                          className="px-2.5 py-2 text-sm font-semibold text-slate-700"
                        >
                          <span className="inline-flex items-center gap-2">
                            {collapsed ? (
                              <ChevronRightSmall className="size-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="size-4 text-slate-400" />
                            )}
                            {g.date} ({g.weekday}) — {g.rows.length} абитуриент(ов)
                          </span>
                        </td>
                      </tr>
                      {!collapsed && g.rows.map((a) => renderRow(a))}
                    </Fragment>
                  );
                })
              ) : (
                items.map((a) => renderRow(a))
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
