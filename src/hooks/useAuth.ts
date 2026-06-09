// Хук авторизации: проверка сессии через /me, login/register/logout.
"use client";
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { useAppStore } from "@/lib/store";

export function useAuth() {
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const authStatus = useAppStore((s) => s.authStatus);
  const setUser = useAppStore((s) => s.setUser);

  // Проверяем сессию один раз при монтировании, если статус ещё неизвестен.
  useEffect(() => {
    if (authStatus !== "loading") return;
    let cancelled = false;
    authApi
      .me()
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, setUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      setUser(res.user);
      return res.user;
    },
    [setUser],
  );

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      const res = await authApi.register(email, username, password);
      setUser(res.user);
      return res.user;
    },
    [setUser],
  );

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
    router.replace("/login");
  }, [setUser, router]);

  return { user, authStatus, login, register, logout };
}
