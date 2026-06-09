// Шапка приложения: логотип, вкладки, текущая зона, профиль/выход.
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Дашборд" },
  { href: "/applicants", label: "Абитуриенты" },
  { href: "/programs", label: "Программы" },
  { href: "/statuses", label: "Статусы" },
  { href: "/manage", label: "Управление" },
];

export function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const timezone = useAppStore((s) => s.timezone);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <GraduationCap className="size-7 text-emerald-600" />
          <span className="text-xl font-bold text-emerald-700">ИСУА</span>
        </Link>

        <nav className="flex items-center gap-1">
          {TABS.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href);
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

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-400 sm:inline">
            {timezone}
          </span>
          {user && (
            <span className="hidden text-sm text-slate-600 md:inline">
              {user.username}
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
      </div>
    </header>
  );
}
