// UI-метаданные статусов абитуриента (метки + цвета badge).
import type { ApplicantStatus } from "@/lib/types";

export const STATUS_META: Record<
  ApplicantStatus,
  { label: string; badge: string }
> = {
  // В таблице — короткая метка «Заявление», различие только цветом.
  applied: { label: "Заявление", badge: "bg-emerald-100 text-emerald-700" },
  withdrawn: { label: "Заявление", badge: "bg-rose-100 text-rose-700" },
};

// Полные подписи (для выпадающих списков фильтра и формы).
export const STATUS_FULL_LABEL: Record<ApplicantStatus, string> = {
  applied: "Подал заявление",
  withdrawn: "Забрал заявление",
};

export const STATUS_OPTIONS: { value: ApplicantStatus; label: string }[] = (
  Object.keys(STATUS_META) as ApplicantStatus[]
).map((value) => ({ value, label: STATUS_FULL_LABEL[value] }));

// Человекочитаемые названия полей (для истории изменений).
export const FIELD_LABELS: Record<string, string> = {
  fullName: "ФИО",
  phone: "Телефон",
  email: "Email",
  programId: "Программа",
  status: "Статус",
  consentToEnroll: "Согласие на зачисление",
  documentsComplete: "Документы собраны",
  specialQuota: "Особая квота",
  specialRight: "Особое право",
  isPaid: "Платное обучение",
  isDistant: "Дистанционное обучение",
  documentType: "Документ об образовании",
  citizenship: "Гражданство",
  passportSeries: "Паспорт (серия)",
  passportNumber: "Паспорт (номер)",
  mathBase: "Математика (база)",
  mathProfile: "Математика (профиль)",
  russian: "Русский язык",
  chemistry: "Химия",
  physics: "Физика",
  informatics: "Информатика",
  geography: "География",
  additionalScores: "Доп. баллы / ВИ",
  registrationAddress: "Прописка",
  inn: "ИНН",
  snils: "СНИЛС",
  notes: "Заметки",
};

export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name;
}

// Человекочитаемое значение поля истории.
// programNames — карта id→название программы (для подмены programId на имя).
export function formatHistoryValue(
  field: string,
  value: string | null,
  programNames?: Map<number, string>,
): string {
  if (value === null || value === "") return "—";
  if (field === "status") {
    return STATUS_FULL_LABEL[value as ApplicantStatus] ?? value;
  }
  if (field === "programId") {
    const id = Number(value);
    return programNames?.get(id) ?? `Программа #${value}`;
  }
  if (field === "documentType") {
    return value === "diploma"
      ? "Диплом"
      : value === "certificate"
        ? "Аттестат"
        : value;
  }
  if (
    [
      "consentToEnroll",
      "documentsComplete",
      "specialQuota",
      "specialRight",
      "isPaid",
      "isDistant",
    ].includes(field)
  ) {
    return value === "true" ? "Да" : "Нет";
  }
  return value;
}

// Форматирование даты в выбранной таймзоне (dd.MM.yyyy).
export function formatDate(date: string | Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleDateString("ru-RU");
  }
}

// Только время (HH:MM:SS) в выбранной таймзоне — для двухстрочной даты в таблице.
export function formatTime(date: string | Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleTimeString("ru-RU");
  }
}

export function formatDateTime(date: string | Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleString("ru-RU");
  }
}
