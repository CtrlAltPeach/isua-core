// Параметры механизма блокировок совместного редактирования.

// Таймаут протухания лока: если нет heartbeat дольше — лок считается свободным.
export const LOCK_TIMEOUT_MS = 30_000;

// Лок протух, если последний heartbeat старше таймаута.
export function isStale(lastHeartbeat: Date, now = Date.now()): boolean {
  return now - lastHeartbeat.getTime() > LOCK_TIMEOUT_MS;
}
