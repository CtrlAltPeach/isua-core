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

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers:
      options.body !== undefined
        ? { "Content-Type": "application/json", ...options.headers }
        : options.headers,
    ...options,
  });

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

// --- Auth ---
export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: PublicUser; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, username: string, password: string) =>
    request<{ user: PublicUser; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    }),
  logout: () => request<{ success: boolean }>("/auth/logout", { method: "POST" }),
  me: () => request<{ user: PublicUser }>("/auth/me"),
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
  history: (id: number) =>
    request<HistoryEntry[]>(`/applicants/${id}/history`),
};

// --- Programs ---
export interface ProgramSummary {
  id: number;
  name: string;
  places: number;
  applicantCount: number;
  competition: number | null;
}

export const programsApi = {
  list: () => request<ProgramSummary[]>("/programs"),
};

// --- Stats ---
export interface ProgramStatRow {
  program: string;
  places: number;
  applicants: number;
  competition: number | null;
  avgScore: number | null;
  withConsent: number;
  withDocuments: number;
  newToday: number;
  consentFillPercent: number;
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
  byProgram: ProgramStatRow[];
}

export const statsApi = {
  daily: (date?: string, timezone?: string) =>
    request<DailyStats>(`/stats/daily${toQuery({ date, timezone })}`),
};
