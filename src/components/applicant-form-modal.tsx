// Модальная форма создания/редактирования абитуриента (с вкладками).
// Live-пересчёт балла (топ-3 + ВИ), math база/профиль взаимоисключающи,
// логика согласия, оптимистичная блокировка.
"use client";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { applicantsApi, programsApi, type ProgramSummary } from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { ApplicantWithProgram, ApplicantStatus } from "@/lib/types";
import { calculateTotalScore } from "@/lib/scoring";
import { STATUS_OPTIONS } from "@/lib/applicant-ui";
import { Modal, Button, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

// Поля формы (строки из инпутов; пустая строка = «не заполнено»).
interface FormValues {
  fullName: string;
  programId: string;
  status: ApplicantStatus;
  phone: string;
  email: string;
  // документы и согласие
  documentsComplete: boolean;
  consentToEnroll: boolean;
  specialQuota: boolean;
  isPaid: boolean;
  documentType: string; // "" | diploma | certificate
  passportSeries: string;
  passportNumber: string;
  citizenship: string;
  // баллы
  mathBase: string;
  mathProfile: string;
  russian: string;
  chemistry: string;
  physics: string;
  informatics: string;
  geography: string;
  additionalScores: string;
  // персональное
  registrationAddress: string;
  inn: string;
  snils: string;
  notes: string;
}

const SCORE_LABELS: { name: keyof FormValues; label: string }[] = [
  { name: "russian", label: "Русский язык" },
  { name: "chemistry", label: "Химия" },
  { name: "physics", label: "Физика" },
  { name: "informatics", label: "Информатика" },
  { name: "geography", label: "География" },
];

const TABS = [
  "Основное",
  "Документы и согласие",
  "Баллы экзаменов",
  "Контакты",
  "Персональное",
] as const;
type TabName = (typeof TABS)[number];

function toStr(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}
function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function defaultsFrom(a: ApplicantWithProgram | null): FormValues {
  return {
    fullName: a?.fullName ?? "",
    programId: a ? String(a.programId) : "",
    status: (a?.status as ApplicantStatus) ?? "applied",
    phone: a?.phone ?? "",
    email: a?.email ?? "",
    documentsComplete: a?.documentsComplete ?? false,
    consentToEnroll: a?.consentToEnroll ?? false,
    specialQuota: a?.specialQuota ?? false,
    isPaid: a?.isPaid ?? false,
    documentType: a?.documentType ?? "",
    passportSeries: a?.passportSeries ?? "",
    passportNumber: a?.passportNumber ?? "",
    citizenship: a?.citizenship ?? "",
    mathBase: toStr(a?.mathBase),
    mathProfile: toStr(a?.mathProfile),
    russian: toStr(a?.russian),
    chemistry: toStr(a?.chemistry),
    physics: toStr(a?.physics),
    informatics: toStr(a?.informatics),
    geography: toStr(a?.geography),
    additionalScores: a?.additionalScores ? String(a.additionalScores) : "",
    registrationAddress: a?.registrationAddress ?? "",
    inn: a?.inn ?? "",
    snils: a?.snils ?? "",
    notes: a?.notes ?? "",
  };
}

// Запрет изменения числовых полей колесом мыши.
const noWheel = (e: React.WheelEvent<HTMLInputElement>) =>
  (e.target as HTMLInputElement).blur();

export function ApplicantFormModal({
  open,
  applicant,
  onClose,
  onSaved,
}: {
  open: boolean;
  applicant: ApplicantWithProgram | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!applicant;
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabName>("Основное");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaultsFrom(applicant) });

  // Перезагружаем значения при открытии/смене записи.
  useEffect(() => {
    if (open) {
      reset(defaultsFrom(applicant));
      setServerError(null);
      setTab("Основное");
    }
  }, [open, applicant, reset]);

  useEffect(() => {
    programsApi.list().then(setPrograms).catch(() => {});
  }, []);

  const watched = watch();

  // Математика база/профиль взаимоисключающи.
  const mathBaseFilled = watched.mathBase.trim() !== "";
  const mathProfileFilled = watched.mathProfile.trim() !== "";

  // Live total_score = топ-3 предметов + доп. баллы (база не входит).
  const liveTotal = useMemo(
    () =>
      calculateTotalScore(
        {
          mathProfile: numOrNull(watched.mathProfile),
          russian: numOrNull(watched.russian),
          chemistry: numOrNull(watched.chemistry),
          physics: numOrNull(watched.physics),
          informatics: numOrNull(watched.informatics),
          geography: numOrNull(watched.geography),
        },
        numOrNull(watched.additionalScores) ?? 0,
      ),
    [
      watched.mathProfile,
      watched.russian,
      watched.chemistry,
      watched.physics,
      watched.informatics,
      watched.geography,
      watched.additionalScores,
    ],
  );

  // Согласие доступно, пока статус не "забрал заявление".
  const status = watched.status;
  const consentAllowed = status !== "withdrawn";
  useEffect(() => {
    if (!consentAllowed && watched.consentToEnroll) {
      setValue("consentToEnroll", false);
    }
  }, [consentAllowed, watched.consentToEnroll, setValue]);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    if (!v.fullName.trim()) {
      setServerError("ФИО обязательно");
      setTab("Основное");
      return;
    }
    if (!v.programId) {
      setServerError("Выберите программу");
      setTab("Основное");
      return;
    }
    if (v.email.trim() && !EMAIL_RE.test(v.email.trim())) {
      setServerError("Некорректный email");
      setTab("Контакты");
      return;
    }

    // База и профиль взаимоисключающи: если задана база — профиль null.
    const mathBase = numOrNull(v.mathBase);
    const mathProfile = mathBase != null ? null : numOrNull(v.mathProfile);

    const payload: Record<string, unknown> = {
      fullName: v.fullName.trim(),
      programId: Number(v.programId),
      status: v.status,
      phone: v.phone.trim() || null,
      email: v.email.trim() || null,
      documentsComplete: v.documentsComplete,
      consentToEnroll: v.consentToEnroll,
      specialQuota: v.specialQuota,
      isPaid: v.isPaid,
      documentType: v.documentType || null,
      passportSeries: v.passportSeries.trim() || null,
      passportNumber: v.passportNumber.trim() || null,
      citizenship: v.citizenship.trim() || null,
      mathBase,
      mathProfile,
      russian: numOrNull(v.russian),
      chemistry: numOrNull(v.chemistry),
      physics: numOrNull(v.physics),
      informatics: numOrNull(v.informatics),
      geography: numOrNull(v.geography),
      additionalScores: numOrNull(v.additionalScores) ?? 0,
      registrationAddress: v.registrationAddress.trim() || null,
      inn: v.inn.trim() || null,
      snils: v.snils.trim() || null,
      notes: v.notes.trim() || null,
    };

    try {
      if (isEdit && applicant) {
        payload.version = applicant.version;
        await applicantsApi.update(applicant.id, payload);
      } else {
        await applicantsApi.create(payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setServerError(
          "Данные были изменены другим пользователем. Закройте и откройте запись заново.",
        );
      } else {
        setServerError(e instanceof ApiError ? e.message : "Ошибка сохранения");
      }
    }
  });

  const scoreInput = (
    name: keyof FormValues,
    label: string,
    disabled = false,
  ) => (
    <div key={name}>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type="number"
        min={0}
        max={100}
        step="1"
        placeholder="0–100"
        disabled={disabled}
        onWheel={noWheel}
        {...register(name)}
      />
    </div>
  );

  const checkbox = (
    name: keyof FormValues,
    label: string,
    disabled = false,
    hint?: string,
  ) => (
    <label
      className={cn(
        "flex items-center gap-2 text-sm",
        disabled ? "text-slate-400" : "text-slate-700",
      )}
      title={hint}
    >
      <input
        type="checkbox"
        disabled={disabled}
        {...register(name)}
        className="size-4 accent-emerald-600"
      />
      {label}
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Редактирование абитуриента" : "Новый абитуриент"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button type="submit" form="applicant-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Сохранить
          </Button>
        </>
      }
    >
      {/* Вкладки */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <form id="applicant-form" onSubmit={onSubmit} className="space-y-5">
        {/* === Основное === */}
        {tab === "Основное" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fullName">ФИО *</Label>
              <Input id="fullName" {...register("fullName")} />
            </div>
            <div>
              <Label htmlFor="programId">Программа *</Label>
              <Select id="programId" {...register("programId")}>
                <option value="">— выберите —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Статус</Label>
              <Select id="status" {...register("status")}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        {/* === Документы и согласие === */}
        {tab === "Документы и согласие" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-6">
              {checkbox("documentsComplete", "Документы собраны")}
              {checkbox(
                "consentToEnroll",
                "Согласие на зачисление",
                !consentAllowed,
                consentAllowed
                  ? undefined
                  : "Недоступно при статусе «Забрал заявление»",
              )}
              {checkbox("specialQuota", "Особая квота")}
              {checkbox("isPaid", "Платное обучение")}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="documentType">Документ об образовании</Label>
                <Select id="documentType" {...register("documentType")}>
                  <option value="">—</option>
                  <option value="diploma">Диплом</option>
                  <option value="certificate">Аттестат</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="passportSeries">Паспорт: серия</Label>
                <Input
                  id="passportSeries"
                  maxLength={4}
                  placeholder="0000"
                  {...register("passportSeries")}
                />
              </div>
              <div>
                <Label htmlFor="passportNumber">Паспорт: номер</Label>
                <Input
                  id="passportNumber"
                  maxLength={6}
                  placeholder="000000"
                  {...register("passportNumber")}
                />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="citizenship">Гражданство</Label>
                <Input
                  id="citizenship"
                  placeholder="Россия"
                  {...register("citizenship")}
                />
              </div>
            </div>
          </div>
        )}

        {/* === Баллы экзаменов === */}
        {tab === "Баллы экзаменов" && (
          <div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="mathBase">Математика (база)</Label>
                <Select
                  id="mathBase"
                  disabled={mathProfileFilled}
                  {...register("mathBase")}
                >
                  <option value="">—</option>
                  {[2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
              {scoreInput("mathProfile", "Математика (профиль)", mathBaseFilled)}
              {SCORE_LABELS.map((s) => scoreInput(s.name, s.label))}
              <div>
                <Label htmlFor="additionalScores">Доп. баллы / ВИ</Label>
                <Input
                  id="additionalScores"
                  type="number"
                  min={0}
                  step="1"
                  placeholder="0"
                  onWheel={noWheel}
                  {...register("additionalScores")}
                />
              </div>
            </div>
            {(mathBaseFilled || mathProfileFilled) && (
              <p className="mt-2 text-xs text-slate-400">
                Математика: база и профиль взаимоисключающи — заполнено одно,
                второе заблокировано.
              </p>
            )}
            <div className="mt-3 rounded-md bg-emerald-50 px-4 py-2 text-sm">
              <span className="text-slate-600">Итоговый балл: </span>
              <span
                className={cn(
                  "text-lg font-bold",
                  liveTotal != null && liveTotal > 300
                    ? "text-amber-600"
                    : "text-emerald-700",
                )}
              >
                {liveTotal != null ? liveTotal : "—"}
              </span>
              <span className="ml-2 text-xs text-slate-400">
                сумма 3 лучших предметов + доп. баллы (база математики не входит)
                {liveTotal != null && liveTotal > 300 && " · переполнение >300"}
              </span>
            </div>
          </div>
        )}

        {/* === Контакты === */}
        {tab === "Контакты" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="phone">Телефон</Label>
              <Input id="phone" {...register("phone")} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
            </div>
          </div>
        )}

        {/* === Персональное === */}
        {tab === "Персональное" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Label htmlFor="registrationAddress">Прописка</Label>
                <Input
                  id="registrationAddress"
                  {...register("registrationAddress")}
                />
              </div>
              <div>
                <Label htmlFor="inn">ИНН</Label>
                <Input id="inn" {...register("inn")} />
              </div>
              <div>
                <Label htmlFor="snils">СНИЛС</Label>
                <Input id="snils" {...register("snils")} />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Заметки</Label>
              <textarea
                id="notes"
                rows={3}
                {...register("notes")}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>
          </div>
        )}

        {serverError && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {serverError}
          </p>
        )}
      </form>
    </Modal>
  );
}
