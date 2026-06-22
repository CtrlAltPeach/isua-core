// Управление программами: таблица + добавление/редактирование/удаление.
"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Check, X, Target } from "lucide-react";
import {
  programsApi,
  programGroupsApi,
  ApiError,
  type ProgramSummary,
  type ProgramGroupRow,
} from "@/lib/api";
import { confirmDialog } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import { Button, Input, Card, Modal, Label, Select } from "@/components/ui";
import { SUBJECT_LABELS } from "@/lib/thresholds";
import { SCORE_FIELDS } from "@/lib/scoring";

export function ProgramManager() {
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [groups, setGroups] = useState<ProgramGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [thresholdFor, setThresholdFor] = useState<ProgramSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Строка в режиме редактирования (id) или создания (id = "new").
  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPlaces, setDraftPlaces] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [progs, grps] = await Promise.all([
        programsApi.list(),
        programGroupsApi.list(),
      ]);
      setPrograms(progs);
      setGroups(grps);
    } catch {
      setError("Не удалось загрузить программы");
    } finally {
      setLoading(false);
    }
  }, []);

  // Смена группы программы (select). null = «Без группы».
  const changeGroup = async (p: ProgramSummary, value: string) => {
    const programGroupId = value === "" ? null : Number(value);
    if (programGroupId === (p.groupId ?? null)) return;
    setError(null);
    try {
      await programsApi.update(p.id, { programGroupId });
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Не удалось сменить группу";
      setError(msg);
      toast.error(msg);
    }
  };

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
    const ok = await confirmDialog({
      title: "Удаление программы",
      message: `Удалить программу «${p.name}»?`,
      confirmText: "Удалить",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await programsApi.remove(p.id);
      toast.success(`Программа «${p.name}» удалена`);
      await load();
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

      <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <th className="px-5 py-2.5 font-medium">Название</th>
            <th className="px-5 py-2.5 text-right font-medium">Мест</th>
            <th className="px-5 py-2.5 text-right font-medium">Абитуриентов</th>
            <th className="px-5 py-2.5 font-medium">Группа</th>
            <th className="w-24 px-5 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="py-10 text-center">
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
                      <Select
                        value={p.groupId ?? ""}
                        onChange={(e) => changeGroup(p, e.target.value)}
                        className="h-9"
                        aria-label={`Группа программы ${p.name}`}
                      >
                        <option value="">Без группы</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setThresholdFor(p)}
                          title="Минимальные баллы"
                          className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-emerald-100 hover:text-emerald-700"
                        >
                          <Target className="size-4" />
                        </button>
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
      </div>

      {thresholdFor && (
        <ThresholdModal
          program={thresholdFor}
          onClose={() => setThresholdFor(null)}
          onSaved={() => {
            setThresholdFor(null);
            void load();
          }}
        />
      )}
    </Card>
  );
}

// Модал редактирования минимальных баллов программы.
function ThresholdModal({
  program,
  onClose,
  onSaved,
}: {
  program: ProgramSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of SCORE_FIELDS) {
      const v = program.minScores?.[f];
      init[f] = typeof v === "number" ? String(v) : "";
    }
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const minScores: Record<string, number> = {};
      for (const f of SCORE_FIELDS) {
        const raw = values[f].trim();
        if (raw !== "") {
          const n = Number(raw);
          if (!Number.isNaN(n)) minScores[f] = Math.round(n);
        }
      }
      await programsApi.update(program.id, {
        minScores: Object.keys(minScores).length > 0 ? minScores : null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Минимальные баллы: ${program.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Сохранить
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-500">
        Порог по каждому предмету (0–100). Пустое поле — порог не задан. Балл ниже
        порога подсветится предупреждением, но не блокирует сохранение.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SCORE_FIELDS.map((f) => (
          <div key={f}>
            <Label htmlFor={`min-${f}`}>{SUBJECT_LABELS[f]}</Label>
            <Input
              id={`min-${f}`}
              type="number"
              min={0}
              max={100}
              step="1"
              placeholder="—"
              value={values[f]}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [f]: e.target.value }))
              }
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
            />
          </div>
        ))}
      </div>
      {error && (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </Modal>
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
      <td className="px-5 py-2 text-slate-400">—</td>
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
