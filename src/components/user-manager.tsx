// Управление пользователями (только admin): список, создание, смена роли, удаление.
"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Loader2, ShieldCheck, User as UserIcon } from "lucide-react";
import { usersApi, ApiError, type UserRow } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button, Input, Card, Modal, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

export function UserManager() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Модалка добавления.
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "operator">("operator");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await usersApi.list());
    } catch {
      setError("Не удалось загрузить пользователей");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const submitAdd = async () => {
    setError(null);
    if (!email.trim() || !username.trim() || password.length < 8) {
      setError("Заполните email, имя и пароль (минимум 8 символов)");
      return;
    }
    setBusy(true);
    try {
      await usersApi.create(email.trim(), username.trim(), password, newRole);
      setAddOpen(false);
      setEmail("");
      setUsername("");
      setPassword("");
      setNewRole("operator");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка создания пользователя");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (u: UserRow, role: "admin" | "operator") => {
    if (u.role === role) return;
    setError(null);
    try {
      await usersApi.setRole(u.id, role);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка смены роли");
    }
  };

  const remove = async (u: UserRow) => {
    if (!confirm(`Удалить пользователя «${u.username}»?`)) return;
    setError(null);
    try {
      await usersApi.remove(u.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка удаления");
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <ShieldCheck className="size-5 text-emerald-600" />
          Пользователи
        </h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Добавить
        </Button>
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-emerald-500" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3 font-medium">Пользователь</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Роль</th>
                <th className="py-2 pr-3 font-medium">Последний вход</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = me?.id === u.id;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="py-2.5 pr-3 font-medium text-slate-800">
                      <span className="inline-flex items-center gap-1.5">
                        <UserIcon className="size-4 text-slate-400" />
                        {u.username}
                        {isMe && (
                          <span className="text-xs text-slate-400">(вы)</span>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{u.email}</td>
                    <td className="py-2.5 pr-3">
                      <Select
                        value={u.role}
                        onChange={(e) =>
                          changeRole(u, e.target.value as "admin" | "operator")
                        }
                        className="h-8 w-32"
                      >
                        <option value="operator">Оператор</option>
                        <option value="admin">Админ</option>
                      </Select>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500">
                      {u.lastLogin
                        ? new Date(u.lastLogin).toLocaleString("ru-RU")
                        : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => remove(u)}
                        disabled={isMe}
                        title={isMe ? "Нельзя удалить себя" : "Удалить"}
                        className={cn(
                          "inline-flex size-8 items-center justify-center rounded-md",
                          isMe
                            ? "cursor-not-allowed text-slate-300"
                            : "text-slate-400 hover:bg-rose-50 hover:text-rose-600",
                        )}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Новый пользователь"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={busy}>
              Отмена
            </Button>
            <Button onClick={submitAdd} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Создать
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="u-name">Имя пользователя</Label>
            <Input
              id="u-name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="u-pass">Пароль (мин. 8 символов)</Label>
            <Input
              id="u-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="u-role">Роль</Label>
            <Select
              id="u-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "admin" | "operator")}
            >
              <option value="operator">Оператор</option>
              <option value="admin">Админ</option>
            </Select>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
