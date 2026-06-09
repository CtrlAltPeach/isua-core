// Управление программами: таблица + добавление/редактирование/удаление.
"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import { programsApi, ApiError, type ProgramSummary } from "@/lib/api";
import { Button, Input, Card } from "@/components/ui";

export function ProgramManager() {
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Строка в режиме редактирования (id) или создания (id = "new").
  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPlaces, setDraftPlaces] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPrograms(await programsApi.list());
    } catch {
      setError("Не удалось загрузить программы");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const startCreate = () => {
    setEditId("new");
    setDraftName("");
    setDraftPlaces("");
    setError(null);
  };
  const startEdit = (p: ProgramSummary) => {
    setEditId(p.id);
    setDraftName(p.name);
    setDraftPlaces(String(p.places));
    setError(null);
  };
  const cancel = () => setEditId(null);

  const save = async () => {
    if (!draftName.trim()) {
      setError("Название обязательно");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = { name: draftName.trim(), places: Number(draftPlaces) || 0 };
      if (editId === "new") {
        await programsApi.create(data);
      } else if (typeof editId === "number") {
        await programsApi.update(editId, data);
      }
      setEditId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: ProgramSummary) => {
    if (!confirm(`Удалить программу «${p.name}»?`)) return;
    setBusy(true);
    setError(null);
    try {
      await programsApi.remove(p.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="font-semibold text-slate-900">Программы</h2>
        <Button size="sm" onClick={startCreate} disabled={editId === "new"}>
          <Plus className="size-4" />
          Добавить
        </Button>
      </div>

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <th className="px-5 py-2.5 font-medium">Название</th>
            <th className="px-5 py-2.5 text-right font-medium">Мест</th>
            <th className="px-5 py-2.5 text-right font-medium">Абитуриентов</th>
            <th className="w-24 px-5 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={4} className="py-10 text-center">
                <Loader2 className="mx-auto size-6 animate-spin text-emerald-500" />
              </td>
            </tr>
          ) : (
            <>
              {editId === "new" && (
                <EditRow
                  name={draftName}
                  places={draftPlaces}
                  onName={setDraftName}
                  onPlaces={setDraftPlaces}
                  onSave={save}
                  onCancel={cancel}
                  busy={busy}
                />
              )}
              {programs.map((p) =>
                editId === p.id ? (
                  <EditRow
                    key={p.id}
                    name={draftName}
                    places={draftPlaces}
                    onName={setDraftName}
                    onPlaces={setDraftPlaces}
                    onSave={save}
                    onCancel={cancel}
                    busy={busy}
                  />
                ) : (
                  <tr
                    key={p.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-emerald-50/40"
                  >
                    <td className="px-5 py-2.5 font-medium text-slate-900">
                      {p.name}
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-600">
                      {p.places}
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-600">
                      {p.applicantCount}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(p)}
                          title="Редактировать"
                          className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-emerald-100 hover:text-emerald-700"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => remove(p)}
                          title="Удалить"
                          className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-rose-100 hover:text-rose-700"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function EditRow({
  name,
  places,
  onName,
  onPlaces,
  onSave,
  onCancel,
  busy,
}: {
  name: string;
  places: string;
  onName: (v: string) => void;
  onPlaces: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <tr className="border-b border-emerald-200 bg-emerald-50/60">
      <td className="px-5 py-2">
        <Input
          autoFocus
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Название программы"
          className="h-9"
        />
      </td>
      <td className="px-5 py-2">
        <Input
          type="number"
          min={0}
          value={places}
          onChange={(e) => onPlaces(e.target.value)}
          className="h-9 text-right"
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
        />
      </td>
      <td className="px-5 py-2 text-right text-slate-400">—</td>
      <td className="px-5 py-2">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onSave}
            disabled={busy}
            title="Сохранить"
            className="inline-flex size-8 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-100"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            title="Отмена"
            className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
