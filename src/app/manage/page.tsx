// Вкладка «Управление» (только admin): пользователи, группы программ, программы
// (CRUD), массовое удаление абитуриентов.
// Группы держим здесь (единый источник правды) и передаём в оба компонента:
// создание группы и смена группы у программы сразу видны в выпадающем списке.
"use client";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ProgramManager } from "@/components/program-manager";
import { ProgramGroupManager } from "@/components/program-group-manager";
import { BulkDeleteManager } from "@/components/bulk-delete-manager";
import { UserManager } from "@/components/user-manager";
import { programGroupsApi, type ProgramGroupRow } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export default function ManagePage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<ProgramGroupRow[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  // Тихий refresh групп (без блокирующего спиннера у программ).
  const reloadGroups = useCallback(async () => {
    try {
      setGroups(await programGroupsApi.list());
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadGroups();
  }, [reloadGroups]);

  // Доступ только для админа (operator получает сообщение).
  if (user && user.role !== "admin") {
    return (
      <AppShell>
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-6 py-8 text-center text-amber-800">
          <p className="text-lg font-semibold">Недостаточно прав</p>
          <p className="mt-1 text-sm">
            Раздел «Управление» доступен только администраторам.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Управление</h1>
      <div className="space-y-6">
        <UserManager />
        <ProgramGroupManager
          groups={groups}
          loading={groupsLoading}
          onChanged={reloadGroups}
        />
        <ProgramManager groups={groups} onGroupsChanged={reloadGroups} />
        <BulkDeleteManager />
      </div>
    </AppShell>
  );
}
