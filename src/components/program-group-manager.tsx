// Управление группами программ (категориями): список + создание/переименование/
// порядок/удаление. Назначение программ в группу — в ProgramManager (select).
"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import {
  programGroupsApi,
  ApiError,
  type ProgramGroupRow,
} from "@/lib/api";
import { confirmDialog } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import { Button, Input, Card } from "@/components/ui";

export function ProgramGroupManager({
  groups,
  loading,
  onChanged,
}: {
  // Список групп и флаг загрузки — из ManagePage (единый источник).
  groups: ProgramGroupRow[];
  loading: boolean;
  // Перечитать группы у родителя после CRUD.
  onChanged: () => void | Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);

  // Строка в режиме редактирования (id) или создания ("new").
  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftOrder, setDraftOrder] = useState("");
  const [busy, setBusy] = useState(false);

  const startCreate = () => {
    setEditId("new");
    setDraftName("");
    setDraftOrder(String(groups.length + 1));
    setError(null);
  };
  const startEdit = (g: ProgramGroupRow) => {
    setEditId(g.id);
    setDraftName(g.name);
    setDraftOrder(String(g.sortOrder));
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
      const data = { name: draftName.trim(), sortOrder: Number(draftOrder) || 0 };
      if (editId === "new") {
        await programGroupsApi.create(data);
      } else if (typeof editId === "number") {
        await programGroupsApi.update(editId, data);
      }
      setEditId(null);
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (g: ProgramGroupRow) => {
    const ok = await confirmDialog({
      title: "Удаление группы",
      message:
        g.programCount > 0
          ? `Удалить группу «${g.name}»? ${g.programCount} программ(ы) станут «Без группы».`
          : `Удалить группу «${g.name}»?`,
      confirmText: "Удалить",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await programGroupsApi.remove(g.id);
      toast.success(`Группа «${g.name}» удалена`);
      await onChanged();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Не удалось удалить";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="font-semibold text-slate-900">Группы программ</h2>
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <th className="px-5 py-2.5 font-medium">Название</th>
              <th className="px-5 py-2.5 text-right font-medium">Порядок</th>
              <th className="px-5 py-2.5 text-right font-medium">Программ</th>
              <th className="w-20 px-5 py-2.5"></th>
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
                    order={draftOrder}
                    onName={setDraftName}
                    onOrder={setDraftOrder}
                    onSave={save}
                    onCancel={cancel}
                    busy={busy}
                  />
                )}
                {groups.length === 0 && editId !== "new" ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-8 text-center text-slate-400"
                    >
                      Групп пока нет. Программы показываются блоком «Без группы».
                    </td>
                  </tr>
                ) : (
                  groups.map((g) =>
                    editId === g.id ? (
                      <EditRow
                        key={g.id}
                        name={draftName}
                        order={draftOrder}
                        onName={setDraftName}
                        onOrder={setDraftOrder}
                        onSave={save}
                        onCancel={cancel}
                        busy={busy}
                      />
                    ) : (
                      <tr
                        key={g.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-emerald-50/40"
                      >
                        <td className="px-5 py-2.5 font-medium text-slate-900">
                          {g.name}
                        </td>
                        <td className="px-5 py-2.5 text-right text-slate-600">
                          {g.sortOrder}
                        </td>
                        <td className="px-5 py-2.5 text-right text-slate-600">
                          {g.programCount}
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(g)}
                              title="Редактировать"
                              className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-emerald-100 hover:text-emerald-700"
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              onClick={() => remove(g)}
                              title="Удалить"
                              className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-rose-100 hover:text-rose-700"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EditRow({
  name,
  order,
  onName,
  onOrder,
  onSave,
  onCancel,
  busy,
}: {
  name: string;
  order: string;
  onName: (v: string) => void;
  onOrder: (v: string) => void;
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
          placeholder="Название группы"
          className="h-9"
        />
      </td>
      <td className="px-5 py-2">
        <Input
          type="number"
          min={0}
          value={order}
          onChange={(e) => onOrder(e.target.value)}
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
