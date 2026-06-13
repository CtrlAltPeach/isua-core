// Хук блокировки записи на время редактирования.
// Захватывает лок при открытии, шлёт heartbeat каждые 10с, снимает при закрытии.
"use client";
import { useEffect, useRef, useState } from "react";
import { locksApi } from "@/lib/api";

const HEARTBEAT_MS = 10_000;

// Стабильный идентификатор сессии вкладки.
function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "isua-session-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function useLock(applicantId: number | null, active: boolean) {
  // Имя пользователя, который уже редактирует (если занято другим), иначе null.
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || applicantId == null) return;
    const sessionId = getSessionId();
    let released = false;

    locksApi
      .acquire(applicantId, sessionId)
      .then((res) => {
        if (res.locked) {
          setLockedBy(null);
          // Запускаем heartbeat, пока держим лок.
          heartbeatRef.current = setInterval(() => {
            locksApi.heartbeat(applicantId, sessionId).catch(() => {});
          }, HEARTBEAT_MS);
        } else {
          setLockedBy(res.lockedBy ?? "другой пользователь");
        }
      })
      .catch(() => setLockedBy(null));

    return () => {
      released = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      setLockedBy(null);
      // Снимаем лок при закрытии (если мы его держали).
      void released;
      locksApi.release(applicantId, sessionId).catch(() => {});
    };
  }, [applicantId, active]);

  return { lockedBy };
}
