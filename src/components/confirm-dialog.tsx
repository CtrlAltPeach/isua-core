// Глобальный диалог подтверждения (рендерится один раз в layout).
"use client";
import { useConfirmStore } from "@/lib/confirm";
import { Modal, Button } from "@/components/ui";

export function ConfirmDialog() {
  const { open, options, respond } = useConfirmStore();
  if (!open || !options) return null;

  return (
    <Modal
      open={open}
      onClose={() => respond(false)}
      title={options.title ?? "Подтверждение"}
      footer={
        <>
          <Button variant="secondary" onClick={() => respond(false)}>
            {options.cancelText ?? "Отмена"}
          </Button>
          <Button
            variant={options.danger ? "danger" : "primary"}
            onClick={() => respond(true)}
          >
            {options.confirmText ?? "Подтвердить"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700">{options.message}</p>
    </Modal>
  );
}
