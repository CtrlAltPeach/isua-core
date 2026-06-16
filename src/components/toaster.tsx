// Контейнер toast-уведомлений (правый нижний угол).
"use client";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { useToastStore, type ToastKind } from "@/lib/toast";
import { cn } from "@/lib/utils";

const META: Record<
  ToastKind,
  { icon: typeof Info; cls: string }
> = {
  success: { icon: CheckCircle2, cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  error: { icon: XCircle, cls: "border-rose-200 bg-rose-50 text-rose-800" },
  info: { icon: Info, cls: "border-slate-200 bg-white text-slate-700" },
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const { icon: Icon, cls } = META[t.kind];
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-md",
              cls,
            )}
            role="status"
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
              title="Закрыть"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
