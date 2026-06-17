// Шапка приложения: на десктопе — верхняя навигация; на телефоне (<md) —
// верхняя строка (логотип + «Ещё») и закреплённая снизу панель вкладок (tab bar).
"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  LogOut,
  LayoutDashboard,
  Users,
  BookOpen,
  ListChecks,
  Settings,
  MoreHorizontal,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  primary?: boolean; // показывать в нижней панели на телефоне
};

const TABS: Tab[] = [
  { href: "/", label: "Дашборд", icon: LayoutDashboard, primary: true },
  { href: "/applicants", label: "Абитуриенты", icon: Users, primary: true },
  { href: "/programs", label: "Программы", icon: BookOpen, primary: true },
  { href: "/statuses", label: "Статусы", icon: ListChecks, primary: true },
  { href: "/manage", label: "Управление", icon: Settings, adminOnly: true },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const timezone = useAppStore((s) => s.timezone);
  const isAdmin = user?.role === "admin";
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const primaryTabs = tabs.filter((t) => t.primary);
  const moreTabs = tabs.filter((t) => !t.primary); // «Управление» (если админ)

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <GraduationCap className="size-7 text-emerald-600" />
            <span className="text-xl font-bold text-emerald-700">ИСУА</span>
          </Link>

          {/* Десктоп: горизонтальная навигация */}
          <nav className="hidden items-center gap-1 lg:flex">
            {tabs.map((tab) => {
              const active = isActive(pathname, tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-base font-medium transition-colors",
                    active
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:bg-emerald-50",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {/* Десктоп: зона/профиль/выход */}
          <div className="hidden items-center gap-3 lg:flex">
            <span className="hidden text-xs text-slate-400 sm:inline">
              {timezone}
            </span>
            {user && (
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                {user.username}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-medium",
                    isAdmin
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  {isAdmin ? "Админ" : "Оператор"}
                </span>
              </span>
            )}
            <button
              onClick={logout}
              title="Выход"
              className="inline-flex size-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="size-4" />
            </button>
          </div>

          {/* Телефон/планшет: кнопка «Ещё» (профиль/выход/доп. вкладки) */}
          <button
            onClick={() => setMoreOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Меню"
          >
            <MoreHorizontal className="size-5" />
          </button>
        </div>
      </header>

      {/* Телефон/планшет: нижняя панель вкладок */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white lg:hidden">
        {primaryTabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-emerald-700" : "text-slate-500",
              )}
            >
              <Icon className={cn("size-5", active && "text-emerald-600")} />
              {tab.label}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"
        >
          <MoreHorizontal className="size-5" />
          Ещё
        </button>
      </nav>

      {/* Отступ снизу, чтобы контент не прятался под панелью (телефон/планшет) */}
      <div className="h-14 lg:hidden" aria-hidden />

      {/* Телефон/планшет: меню «Ещё» */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Меню</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="Закрыть"
              >
                <X className="size-5" />
              </button>
            </div>

            {user && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {user.username}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-medium",
                    isAdmin
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  {isAdmin ? "Админ" : "Оператор"}
                </span>
              </div>
            )}

            {moreTabs.map((tab) => {
              const active = isActive(pathname, tab.href);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium",
                    active
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <Icon className="size-5" />
                  {tab.label}
                </Link>
              );
            })}

            <button
              onClick={() => {
                setMoreOpen(false);
                logout();
              }}
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut className="size-5" />
              Выход
            </button>
          </div>
        </div>
      )}
    </>
  );
}
