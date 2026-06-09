// Модальная форма создания/редактирования абитуриента.
// Live-пересчёт среднего балла, логика согласия, оптимистичная блокировка.
"use client";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { applicantsApi, programsApi, type ProgramSummary } from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { ApplicantWithProgram, ApplicantStatus } from "@/lib/types";
import { calculateTotalScore } from "@/lib/scoring";
import { STATUS_OPTIONS } from "@/lib/applicant-ui";
import {
  Modal,
  Button,
  Input,
  Label,
  Select,
  FieldError,
} from "@/components/ui";

// Поля формы (строки из инпутов; пустая строка = «не заполнено»).
interface FormValues {
  fullName: string;
  programId: string;
  status: ApplicantStatus;
  phone: string;
  email: string;
  mathBase: string;
  mathProfile: string;
  russian: string;
  chemistry: string;
  physics: string;
  informatics: string;
  geography: string;
  registrationAddress: string;
  inn: string;
  snils: string;
  notes: string;
  documentsComplete: boolean;
  consentToEnroll: boolean;
}

const SCORE_LABELS: { name: keyof FormValues; label: string }[] = [
  { name: "mathProfile", label: "Математика (профиль)" },
  { name: "russian", label: "Русский язык" },
  { name: "chemistry", label: "Химия" },
  { name: "physics", label: "Физика" },
  { name: "informatics", label: "Информатика" },
  { name: "geography", label: "География" },
];

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
    mathBase: toStr(a?.mathBase),
    mathProfile: toStr(a?.mathProfile),
    russian: toStr(a?.russian),
    chemistry: toStr(a?.chemistry),
    physics: toStr(a?.physics),
    informatics: toStr(a?.informatics),
    geography: toStr(a?.geography),
    registrationAddress: a?.registrationAddress ?? "",
    inn: a?.inn ?? "",
    snils: a?.snils ?? "",
    notes: a?.notes ?? "",
    documentsComplete: a?.documentsComplete ?? false,
    consentToEnroll: a?.consentToEnroll ?? false,
  };
}

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

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaultsFrom(applicant) });

  // Перезагружаем значения при открытии/смене записи.
  useEffect(() => {
    if (open) {
      reset(defaultsFrom(applicant));
      setServerError(null);
    }
  }, [open, applicant, reset]);

  useEffect(() => {
    programsApi.list().then(setPrograms).catch(() => {});
  }, []);

  // Live total_score.
  const watched = watch();
  const liveTotal = useMemo(
    () =>
      calculateTotalScore({
        mathProfile: numOrNull(watched.mathProfile),
        russian: numOrNull(watched.russian),
        chemistry: numOrNull(watched.chemistry),
        physics: numOrNull(watched.physics),
        informatics: numOrNull(watched.informatics),
        geography: numOrNull(watched.geography),
      }),
    [
      watched.mathProfile,
      watched.russian,
      watched.chemistry,
      watched.physics,
      watched.informatics,
      watched.geography,
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

  // Простая проверка корректности email.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    if (!v.fullName.trim()) {
      setServerError("ФИО обязательно");
      return;
    }
    if (!v.programId) {
      setServerError("Выберите программу");
      return;
    }
    if (v.email.trim() && !EMAIL_RE.test(v.email.trim())) {
      setServerError("Некорректный email");
      return;
    }

    const payload: Record<string, unknown> = {
      fullName: v.fullName.trim(),
      programId: Number(v.programId),
      status: v.status,
      phone: v.phone.trim() || null,
      email: v.email.trim() || null,
      mathBase: numOrNull(v.mathBase),
      mathProfile: numOrNull(v.mathProfile),
      russian: numOrNull(v.russian),
      chemistry: numOrNull(v.chemistry),
      physics: numOrNull(v.physics),
      informatics: numOrNull(v.informatics),
      geography: numOrNull(v.geography),
      registrationAddress: v.registrationAddress.trim() || null,
      inn: v.inn.trim() || null,
      snils: v.snils.trim() || null,
      notes: v.notes.trim() || null,
      documentsComplete: v.documentsComplete,
      consentToEnroll: v.consentToEnroll,
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

  const scoreInput = (name: keyof FormValues, label: string) => (
    <div key={name}>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type="number"
        min={0}
        max={100}
        step="1"
        placeholder="0–100"
        {...register(name)}
      />
    </div>
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
      <form id="applicant-form" onSubmit={onSubmit} className="space-y-5">
        {/* Основное */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="fullName">ФИО *</Label>
            <Input id="fullName" {...register("fullName")} />
            <FieldError>{errors.fullName?.message}</FieldError>
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
          <div>
            <Label htmlFor="phone">Телефон</Label>
            <Input id="phone" {...register("phone")} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
          </div>
        </div>

        {/* Экзамены */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            Результаты экзаменов
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="mathBase">Математика (база)</Label>
              <Select id="mathBase" {...register("mathBase")}>
                <option value="">—</option>
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
            {SCORE_LABELS.map((s) => scoreInput(s.name, s.label))}
          </div>
          <div className="mt-3 rounded-md bg-emerald-50 px-4 py-2 text-sm">
            <span className="text-slate-600">Сумма баллов (топ-3): </span>
            <span className="text-lg font-bold text-emerald-700">
              {liveTotal != null ? liveTotal : "—"}
            </span>
            <span className="ml-2 text-xs text-slate-400">
              сумма 3 лучших предметов (мин. 3), макс. 300; база математики не входит
            </span>
          </div>
        </div>

        {/* Прочее */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="registrationAddress">Прописка</Label>
            <Input id="registrationAddress" {...register("registrationAddress")} />
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
            rows={2}
            {...register("notes")}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>

        {/* Флаги */}
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              {...register("documentsComplete")}
              className="size-4 accent-emerald-600"
            />
            Документы собраны
          </label>
          <label
            className={`flex items-center gap-2 text-sm ${consentAllowed ? "text-slate-700" : "text-slate-400"}`}
            title={
              consentAllowed
                ? ""
                : "Согласие доступно только при статусе «Зачислен»"
            }
          >
            <input
              type="checkbox"
              disabled={!consentAllowed}
              {...register("consentToEnroll")}
              className="size-4 accent-emerald-600"
            />
            Согласие на зачисление
          </label>
        </div>

        {serverError && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {serverError}
          </p>
        )}
      </form>
    </Modal>
  );
}
