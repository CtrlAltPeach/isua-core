// Массовое удаление абитуриентов: мультиселект + подтверждение.
"use client";
import { useCallback, useEffect, useState } from "react";
import { Search, Trash2, Loader2 } from "lucide-react";
import { applicantsApi, ApiError } from "@/lib/api";
import type { ApplicantWithProgram } from "@/lib/types";
import { confirmDialog } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import { Button, Input, Card } from "@/components/ui";

export function BulkDeleteManager() {
  const [items, setItems] = useState<ApplicantWithProgram[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // debounce поиска
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await applicantsApi.list({
        search: debounced || undefined,
        limit: 100,
        sort_by: "fullName",
        order: "asc",
      });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === items.length
        ? new Set()
        : new Set(items.map((i) => i.id)),
    );

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const ok = await confirmDialog({
      title: "Массовое удаление",
      message: `Удалить ${selected.size} абитуриент(ов)? Действие необратимо.`,
      confirmText: "Удалить",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await applicantsApi.bulkDelete([...selected]);
      toast.success(`Удалено: ${res.deleted}`);
      setSelected(new Set());
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Ошибка удаления";
      setMessage(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const allChecked = items.length > 0 && selected.size === items.length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 className="font-semibold text-slate-900">
          Удаление абитуриентов
        </h2>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="relative flex-1 sm:w-60 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск…"
              className="h-9 pl-9"
            />
          </div>
          {/* На мобильном — только иконка + счётчик (текст не влезает) */}
          <Button
            variant="danger"
            size="sm"
            disabled={selected.size === 0 || busy}
            onClick={deleteSelected}
            title="Удалить выбранные"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            <span className="hidden sm:inline">Удалить выбранные</span>
            <span> ({selected.size})</span>
          </Button>
        </div>
      </div>

      {message && (
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className="max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="w-10 px-5 py-2.5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="size-4 accent-emerald-600"
                />
              </th>
              <th className="px-5 py-2.5 font-medium">ФИО</th>
              <th className="px-5 py-2.5 font-medium">Программа</th>
              <th className="px-5 py-2.5 text-right font-medium">Балл</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-emerald-500" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-400">
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              items.map((a) => (
                <tr
                  key={a.id}
                  className={`border-b border-slate-100 last:border-0 ${selected.has(a.id) ? "bg-rose-50/60" : "hover:bg-slate-50"}`}
                >
                  <td className="px-5 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                      className="size-4 accent-emerald-600"
                    />
                  </td>
                  <td className="px-5 py-2.5 font-medium text-slate-900">
                    {a.fullName}
                  </td>
                  <td className="px-5 py-2.5 text-slate-600">
                    {a.program?.name ?? "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right text-slate-600">
                    {a.totalScore ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 px-5 py-2 text-xs text-slate-400">
        Показано {items.length} из {total} (поиск ограничивает выборку)
      </div>
    </Card>
  );
}
