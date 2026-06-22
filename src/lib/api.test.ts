// Тесты retry/переподключения в клиентской fetch-обёртке (12C).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { request, ApiError } from "./api";

// Удобный конструктор Response-подобного объекта для мока fetch.
function res(
  status: number,
  body: unknown = undefined,
  ok = status >= 200 && status < 300,
) {
  return {
    ok,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as unknown as Response;
}

describe("api request() — retry/переподключение", () => {
  beforeEach(() => {
    // Ускоряем backoff: setTimeout мгновенно.
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Прогон промиса вместе с проматыванием таймеров backoff. Навешиваем
  // обработчик сразу (через allSettled), чтобы отклонение не считалось
  // «unhandled» во время прокрутки таймеров.
  async function runWithTimers<T>(p: Promise<T>): Promise<T> {
    const settled = Promise.allSettled([p]);
    await vi.runAllTimersAsync();
    const [r] = await settled;
    if (r.status === "rejected") throw r.reason;
    return r.value;
  }

  it("успешный GET возвращает данные без повторов", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, { items: [], total: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await runWithTimers(request("/applicants"));
    expect(data).toEqual({ items: [], total: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("GET повторяется при сетевой ошибке и затем успешен", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(res(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await runWithTimers(request("/applicants"));
    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("GET повторяется на 503 и сдаётся после MAX_ATTEMPTS", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(503, { error: "busy" }, false));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runWithTimers(request("/applicants"))).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS
  });

  it("сетевая ошибка после всех попыток → ApiError со status 0", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const err = await runWithTimers(request("/applicants")).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("POST НЕ повторяется при сетевой ошибке (не идемпотентен)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const err = await runWithTimers(
      request("/applicants", { method: "POST", body: "{}" }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1); // без повторов
  });

  it("POST с 503 НЕ повторяется и пробрасывает ошибку сразу", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(503, { error: "busy" }, false));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runWithTimers(request("/applicants", { method: "POST", body: "{}" })),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("4xx (например 401) НЕ повторяется", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(401, { error: "no auth" }, false));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runWithTimers(request("/auth/me"))).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
