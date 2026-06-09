// UI-метаданные статусов абитуриента (метки + цвета badge).
import type { ApplicantStatus } from "@/lib/types";

export const STATUS_META: Record<
  ApplicantStatus,
  { label: string; badge: string }
> = {
  applied: { label: "Подал заявление", badge: "bg-emerald-100 text-emerald-700" },
  withdrawn: { label: "Забрал заявление", badge: "bg-rose-100 text-rose-700" },
};

export const STATUS_OPTIONS: { value: ApplicantStatus; label: string }[] = (
  Object.keys(STATUS_META) as ApplicantStatus[]
).map((value) => ({ value, label: STATUS_META[value].label }));

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
