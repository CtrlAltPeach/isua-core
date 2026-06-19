// Модалка смены собственного пароля (D2).
"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { authApi, ApiError } from "@/lib/api";
import { changePasswordSchema } from "@/lib/validation";
import { toast } from "@/lib/toast";
import { Modal, Button, Input, Label, FieldError } from "@/components/ui";

// Расширяем серверную схему подтверждением нового пароля (только на клиенте).
const formSchema = changePasswordSchema
  .extend({ confirmPassword: z.string() })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof formSchema>;

export function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const close = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    try {
      await authApi.changePassword(data.currentPassword, data.newPassword);
      toast.success("Пароль изменён");
      close();
    } catch (e) {
      setServerError(
        e instanceof ApiError ? e.message : "Не удалось изменить пароль",
      );
    }
  });

  return (
    <Modal
      open={open}
      onClose={close}
      title="Смена пароля"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Сохранить
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="currentPassword">Текущий пароль</Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            {...register("currentPassword")}
          />
          <FieldError>{errors.currentPassword?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="newPassword">Новый пароль</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            {...register("newPassword")}
          />
          <FieldError>{errors.newPassword?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="confirmPassword">Повторите новый пароль</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
          <FieldError>{errors.confirmPassword?.message}</FieldError>
        </div>

        {serverError && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {serverError}
          </p>
        )}
      </form>
    </Modal>
  );
}
