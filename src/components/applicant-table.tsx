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
  Loader2,
  FileDown,
  HelpCircle,
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
  formatBirthDate,
} from "@/lib/applicant-ui";
import { failingSubjects } from "@/lib/thresholds";
import { Button, Input, Select, Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100, 0]; // 0 = все записи

type SortKey = "fullName" | "status" | "totalScore" | "createdAt";

// align: выравнивание; thClass: ширина/выравнивание ячеек.
type ColAlign = "left" | "right" | "center";

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

// ОБНОВЛЕННЫЕ ЦВЕТА МАРКЕРОВ
function Markers({ a }: { a: ApplicantWithProgram }) {
  return (
    <>
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
          title="Особая квота"
          className="inline-flex h-5 shrink-0 items-center justify-center rounded bg-amber-50 px-1 text-xs font-bold text-amber-700"
        >
          ОК
        </span>
      )}
      {a.specialRight && (
        <span
          title="Особое право"
          className="inline-flex h-5 shrink-0 items-center justify-center rounded bg-amber-50 px-1 text-xs font-bold text-amber-700"
        >
          ОП
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
          // Индиго дает красивый контраст с изумрудным
          className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-indigo-50 text-xs font-bold text-indigo-600"
        >
          Д
        </span>
      )}
      {a.notes && (
        <span
          title={a.notes}
          // Бирюзовый (cyan) отлично вписывается в зелено-белую гамму
          className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-amber-100 text-xs font-bold text-amber-700"
        >
          З
        </span>
      )}
    </>
  );
}

// Легенда обозначений (иконки/сокращения таблицы). Бейджи здесь продублированы
// из <Markers> и ячеек таблицы — держать визуал в синхроне при смене стилей.
function Legend() {
  const items: { badge: React.ReactNode; text: string }[] = [
    {
      badge: (
        <span className="inline-flex size-5 items-center justify-center rounded bg-red-50 text-xs font-bold text-red-600">
          Б
        </span>
      ),
      text: "База математики (оценка 2–5, в рейтинг не входит)",
    },
    {
      badge: (
        <span className="inline-flex h-5 items-center justify-center rounded bg-amber-50 px-1 text-xs font-bold text-amber-700">
          ОК
        </span>
      ),
      text: "Особая квота",
    },
    {
      badge: (
        <span className="inline-flex h-5 items-center justify-center rounded bg-amber-50 px-1 text-xs font-bold text-amber-700">
          ОП
        </span>
      ),
      text: "Особое право",
    },
    {
      badge: (
        <span className="inline-flex size-5 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-500">
          П
        </span>
      ),
      text: "Платное обучение",
    },
    {
      badge: (
        <span className="inline-flex size-5 items-center justify-center rounded bg-indigo-50 text-xs font-bold text-indigo-600">
          Д
        </span>
      ),
      text: "Дистанционное обучение",
    },
    {
      badge: (
        <span className="inline-flex size-5 items-center justify-center rounded bg-amber-100 text-xs font-bold text-amber-700">
          З
        </span>
      ),
      text: "Есть заметка",
    },
    {
      badge: <span className="inline-block size-2 rounded-full bg-amber-400" />,
      text: "Балл по вступительным испытаниям (ВИ), а не по ЕГЭ",
    },
    {
      badge: <AlertTriangle className="size-3.5 text-amber-500" />,
      text: "Балл ниже минимального порога программы",
    },
    {
      badge: <Check className="size-5 stroke-3 text-emerald-600" />,
      text: "Согл. / Док. — есть согласие / документы собраны",
    },
    {
      badge: <span className="font-bold text-red-400">✗</span>,
      text: "Согл. / Док. — нет согласия / документы не собраны",
    },
  ];
  return (
    <Card className="border-emerald-100 bg-emerald-50/40 p-4">
      <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Обозначения
      </p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="flex w-6 shrink-0 justify-center">{it.badge}</span>
            <span className="text-slate-600">{it.text}</span>
          </div>
        ))}
      </dl>
    </Card>
  );
}

// Детали абитуриента (паспорт, контакты, заметка) — общий блок для строки-детали
// таблицы и раскрытой карточки на мобильном.
function ApplicantDetails({ a }: { a: ApplicantWithProgram }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
      <Detail label="Дата рождения" value={formatBirthDate(a.birthDate)} />
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
      {a.viScore != null && (
        <Detail label="ВИ (вступит. испытания)" value={String(a.viScore)} />
      )}
      {a.additionalScores > 0 && (
        <Detail label="Доп. баллы" value={String(a.additionalScores)} />
      )}
      {a.notes && (
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-xs font-medium text-slate-400">Заметка</dt>
          <dd className="whitespace-pre-wrap text-slate-700">{a.notes}</dd>
        </div>
      )}
    </dl>
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

  // Панель «Обозначения» (легенда иконок/сокращений).
  const [showLegend, setShowLegend] = useState(false);

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
    programsApi
      .list()
      .then(setPrograms)
      .catch(() => {});
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
      const key = formatDate(a.createdAt, timezone);
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
    const failing = prog?.minScores ? failingSubjects(a, prog.minScores) : [];
    const expanded = expandedRows.has(a.id);
    return (
      <Fragment key={a.id}>
        <tr
          onClick={() => onEdit(a)}
          className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-emerald-50/50"
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
              <Markers a={a} />
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
              {a.viScore != null && (
                <span
                  title="Балл по вступительным испытаниям (ВИ), не по ЕГЭ"
                  className="inline-block size-2 shrink-0 rounded-full bg-amber-400"
                />
              )}
              {a.totalScore != null ? a.totalScore : "—"}
            </span>
          </td>
          <td className="px-2.5 py-3 text-center">
            {a.consentToEnroll ? (
              <Check className="mx-auto size-5 stroke-3 text-emerald-600" />
            ) : (
              // Меняем резкий rose-400 на более спокойный red-400
              <span className="font-bold text-red-400">✗</span>
            )}
          </td>
          <td className="px-2.5 py-3 text-center">
            {a.documentsComplete ? (
              <Check className="mx-auto size-5 stroke-3 text-emerald-600" />
            ) : (
              <span className="font-bold text-red-400">✗</span>
            )}
          </td>
          <td
            className="truncate px-2.5 py-3 text-slate-600"
            title={a.phone ?? ""}
          >
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
              <ApplicantDetails a={a} />
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  // Карточный режим (мобильный, <md): те же данные, что в строке, но без
  // горизонтального скролла. Тап по карточке открывает редактирование.
  const renderCard = (a: ApplicantWithProgram) => {
    const meta = STATUS_META[a.status as ApplicantStatus];
    const prog = programs.find((p) => p.id === a.programId);
    const failing = prog?.minScores ? failingSubjects(a, prog.minScores) : [];
    const expanded = expandedRows.has(a.id);
    return (
      <div
        key={a.id}
        onClick={() => onEdit(a)}
        className="cursor-pointer border-b border-slate-100 p-3 last:border-0 transition-colors active:bg-emerald-50/50"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 font-medium text-slate-900">
            <span className="min-w-0 truncate" title={a.fullName}>
              {a.fullName}
            </span>
            <Markers a={a} />
          </div>
          <div className="flex shrink-0 items-center gap-1 text-right font-semibold text-slate-900">
            {failing.length > 0 && (
              <AlertTriangle className="size-3.5 text-amber-500" />
            )}
            {a.viScore != null && (
              <span
                title="Балл по вступительным испытаниям (ВИ), не по ЕГЭ"
                className="inline-block size-2 shrink-0 rounded-full bg-amber-400"
              />
            )}
            {a.totalScore != null ? a.totalScore : "—"}
            <span className="text-xs font-normal text-slate-400">б</span>
          </div>
        </div>

        <div className="mt-1 truncate text-sm text-slate-600">
          {a.program?.name ?? "—"}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {meta ? (
            <Badge className={meta.badge}>{meta.label}</Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-500">{a.status}</Badge>
          )}
          <span className="inline-flex items-center gap-1">
            Согл.
            {a.consentToEnroll ? (
              <Check className="size-4 stroke-3 text-emerald-600" />
            ) : (
              <span className="font-bold text-red-400">✗</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1">
            Док.
            {a.documentsComplete ? (
              <Check className="size-4 stroke-3 text-emerald-600" />
            ) : (
              <span className="font-bold text-red-400">✗</span>
            )}
          </span>
          {a.phone && <span>{a.phone}</span>}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleRow(a.id);
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRightSmall className="size-4" />
            )}
            Детали
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onHistory(a);
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-emerald-100 hover:text-emerald-700"
          >
            <Clock className="size-4" />
            История
          </button>
          {/* Дата+время — справа, на одном уровне с кнопкой «История» */}
          <span className="ml-auto text-right text-xs leading-tight text-slate-400">
            {formatDate(a.createdAt, timezone)}{" "}
            <span className="text-slate-400">
              {formatTime(a.createdAt, timezone)}
            </span>
          </span>
        </div>

        {expanded && (
          <div className="mt-2 rounded-lg bg-slate-50 p-3">
            <ApplicantDetails a={a} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Абитуриенты</h1>
        <div className="flex items-center gap-2">
          {/* Экспорт в XLSX: прямая навигация на эндпоинт (cookie-авторизация
              применяется автоматически, скачивание файлом по Content-Disposition). */}
          <Button
            variant="secondary"
            onClick={() => {
              window.location.href = "/api/applicants/export";
            }}
            title="Экспорт всех абитуриентов в XLSX"
          >
            <FileDown className="size-4" />
            <span className="hidden sm:inline">Экспорт</span>
          </Button>
          <Button onClick={onCreate}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Добавить</span>
          </Button>
        </div>
      </div>

      {/* Панель управления */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-60 flex-1 sm:w-auto">
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
          className="w-full sm:w-48"
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
          className="w-full sm:w-44"
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
        <Button
          variant={showLegend ? "primary" : "secondary"}
          size="sm"
          onClick={() => setShowLegend((v) => !v)}
          title="Показать обозначения иконок и сокращений"
        >
          <HelpCircle className="size-4" />
          Обозначения
        </Button>
      </div>

      {showLegend && <Legend />}

      {/* Таблица — область фикс-высоты: шапка закреплена (sticky),
          вертикальный и горизонтальный скролл внутри этой области.
          На телефоне (<md) таблица скрыта — вместо неё карточный список. */}
      <Card className="overflow-hidden">
        <div className="hidden max-h-[calc(100vh-19rem)] overflow-auto lg:block">
          <table className="w-full min-w-200 table-fixed text-sm">
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
                        className="cursor-pointer border-b border-slate-200 bg-slate-50 transition-colors hover:bg-emerald-50/50"
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
                            {g.date} ({g.weekday}) — {g.rows.length}{" "}
                            абитуриент(ов)
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

        {/* Карточный режим (телефон/планшет, <lg) */}
        <div className="max-h-[calc(100vh-19rem)] overflow-auto lg:hidden">
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="mx-auto size-7 animate-spin text-emerald-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              Ничего не найдено
            </div>
          ) : groupByDay ? (
            dayGroups.map((g) => {
              const collapsed = collapsedDays.has(g.date);
              return (
                <Fragment key={g.date}>
                  <button
                    onClick={() => toggleDay(g.date)}
                    className="flex w-full items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-700"
                  >
                    {collapsed ? (
                      <ChevronRightSmall className="size-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="size-4 text-slate-400" />
                    )}
                    {g.date} ({g.weekday}) — {g.rows.length} абит.
                  </button>
                  {!collapsed && g.rows.map((a) => renderCard(a))}
                </Fragment>
              );
            })
          ) : (
            items.map((a) => renderCard(a))
          )}
        </div>
      </Card>

      {/* Пагинация */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <span>
            Показано {from}–{to} из {total}
          </span>
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
                {s === 0 ? "Все" : s}
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
