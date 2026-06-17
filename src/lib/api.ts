// Клиентские fetch-обёртки. Cookie с токеном отправляется автоматически
// (credentials: "include"), поэтому токен в заголовок вручную не кладём.
import type {
  Applicant,
  ApplicantListResponse,
  PublicUser,
  HistoryEntry,
} from "@/lib/types";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Параметры повторных попыток при временных сбоях (потеря соединения, 5xx).
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 300; // 300мс, 900мс между попытками
// Транзиентные HTTP-коды, которые имеет смысл повторить (шлюз/перегрузка).
const RETRYABLE_STATUS = new Set([502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Повторяем только идемпотентные запросы (GET/HEAD) — повтор POST/PUT/DELETE
// мог бы создать дубль/повторно применить изменение.
function isIdempotent(method: string | undefined) {
  const m = (method ?? "GET").toUpperCase();
  return m === "GET" || m === "HEAD";
}

// Экспортируется для unit-тестов retry-логики; в приложении используется
// через типизированные обёртки ниже (applicantsApi и т.д.).
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const idempotent = isIdempotent(options.method);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`/api${path}`, {
        credentials: "include",
        headers:
          options.body !== undefined
            ? { "Content-Type": "application/json", ...options.headers }
            : options.headers,
        ...options,
      });
    } catch {
      // fetch бросает TypeError при сетевой ошибке (нет соединения, DNS, abort).
      lastErr = new ApiError("Нет соединения с сервером", 0);
      if (idempotent && attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BACKOFF_MS * attempt);
        continue;
      }
      throw lastErr;
    }

    // Транзиентный 5xx у идемпотентного запроса — повторяем.
    if (idempotent && RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
      lastErr = new ApiError(`Ошибка запроса (${res.status})`, res.status);
      await sleep(RETRY_BACKOFF_MS * attempt);
      continue;
    }

    // Пустой ответ (например, 204) — возвращаем undefined.
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;

    if (!res.ok) {
      const message =
        (data && typeof data === "object" && "error" in data
          ? (data as { error: string }).error
          : null) ?? `Ошибка запроса (${res.status})`;
      throw new ApiError(message, res.status, (data as { details?: unknown })?.details);
    }
    return data as T;
  }

  // Исчерпали попытки (только идемпотентные сюда доходят).
  throw lastErr ?? new ApiError("Нет соединения с сервером", 0);
}

// --- Auth ---
export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: PublicUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, username: string, password: string) =>
    request<{ user: PublicUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    }),
  logout: () => request<{ success: boolean }>("/auth/logout", { method: "POST" }),
  me: () => request<{ user: PublicUser }>("/auth/me"),
};

// --- Users (admin) ---
export interface UserRow {
  id: number;
  email: string;
  username: string;
  role: "admin" | "operator";
  createdAt: string;
  lastLogin: string | null;
}

export const usersApi = {
  list: () => request<UserRow[]>("/users"),
  // Создание юзера админом — через /auth/register (admin-сценарий).
  create: (
    email: string,
    username: string,
    password: string,
    role: "admin" | "operator",
  ) =>
    request<{ user: PublicUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password, role }),
    }),
  setRole: (id: number, role: "admin" | "operator") =>
    request<UserRow>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  remove: (id: number) =>
    request<{ success: boolean }>(`/users/${id}`, { method: "DELETE" }),
};

// --- Applicants ---
export interface ApplicantFilters {
  search?: string;
  status?: string;
  program_id?: number;
  sort_by?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

// Принимаем любой объект (в т.ч. интерфейсы без индексной сигнатуры).
function toQuery(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export const applicantsApi = {
  list: (filters: ApplicantFilters = {}) =>
    request<ApplicantListResponse>(`/applicants${toQuery(filters)}`),
  get: (id: number) => request<Applicant>(`/applicants/${id}`),
  create: (data: Record<string, unknown>) =>
    request<Applicant>("/applicants", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Record<string, unknown>) =>
    request<Applicant>(`/applicants/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  remove: (id: number) =>
    request<{ success: boolean }>(`/applicants/${id}`, { method: "DELETE" }),
  bulkDelete: (ids: number[]) =>
    request<{ deleted: number }>("/applicants/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  history: (id: number) =>
    request<HistoryEntry[]>(`/applicants/${id}/history`),
};

// --- Programs ---
export type MinScores = Record<string, number>;

export interface ProgramSummary {
  id: number;
  name: string;
  places: number;
  minScores: MinScores;
  applicantCount: number;
  competition: number | null;
}

interface ProgramInput {
  name?: string;
  places?: number;
  minScores?: MinScores | null;
}

export const programsApi = {
  list: () => request<ProgramSummary[]>("/programs"),
  create: (data: ProgramInput) =>
    request<ProgramSummary>("/programs", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number, data: ProgramInput) =>
    request<ProgramSummary>(`/programs/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  remove: (id: number) =>
    request<{ success: boolean }>(`/programs/${id}`, { method: "DELETE" }),
};

// --- Locks ---
export const locksApi = {
  acquire: (applicantId: number, userSessionId: string) =>
    request<{ locked: boolean; lockedBy?: string }>(`/locks/${applicantId}`, {
      method: "POST",
      body: JSON.stringify({ userSessionId }),
    }),
  heartbeat: (applicantId: number, userSessionId: string) =>
    request<{ ok: boolean }>(`/locks/${applicantId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ userSessionId }),
    }),
  release: (applicantId: number, userSessionId: string) =>
    request<{ unlocked: boolean }>(
      `/locks/${applicantId}?userSessionId=${encodeURIComponent(userSessionId)}`,
      { method: "DELETE" },
    ),
};

// --- Stats ---
export interface ProgramStatRow {
  programId: number;
  program: string;
  places: number;
  applicants: number;
  competition: number | null;
  avgScore: number | null;
  withConsent: number;
  withDocuments: number;
  withPaid: number;
  newToday: number;
  consentFillPercent: number;
  applied: number;
  withdrawn: number;
  topApplicants: { fullName: string; totalScore: number | null }[];
}

export interface DailyStats {
  date: string;
  timezone: string;
  totalApplicants: number;
  newApplications: number;
  applied: number;
  withdrawn: number;
  withConsent: number;
  withDocuments: number;
  withPaid: number;
  consentGivenToday: number;
  consentWithdrawnToday: number;
  totalPlaces: number;
  totalApplications: number;
  applicationsPerPlace: number | null;
  consentPerApplication: number;
  byProgram: ProgramStatRow[];
}

export const statsApi = {
  daily: (date?: string, timezone?: string) =>
    request<DailyStats>(`/stats/daily${toQuery({ date, timezone })}`),
};
