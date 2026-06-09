// Экран регистрации.
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { Button, Input, Label, Card, FieldError } from "@/components/ui";

// Расширяем серверную схему полем подтверждения пароля.
const formSchema = registerSchema
  .extend({ confirm: z.string() })
  .refine((d) => d.password === d.confirm, {
    message: "Пароли не совпадают",
    path: ["confirm"],
  });

type RegisterForm = z.infer<typeof formSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    try {
      await registerUser(data.email, data.username, data.password);
      router.replace("/");
    } catch (e) {
      setServerError(
        e instanceof ApiError ? e.message : "Не удалось зарегистрироваться",
      );
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Создать аккаунт</h1>
          <p className="mt-1 text-sm text-slate-500">ИСУА</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            <FieldError>{errors.email?.message}</FieldError>
          </div>

          <div>
            <Label htmlFor="username">Имя пользователя</Label>
            <Input id="username" autoComplete="username" {...register("username")} />
            <FieldError>{errors.username?.message}</FieldError>
          </div>

          <div>
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
            <FieldError>{errors.password?.message}</FieldError>
          </div>

          <div>
            <Label htmlFor="confirm">Повтор пароля</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              {...register("confirm")}
            />
            <FieldError>{errors.confirm?.message}</FieldError>
          </div>

          {serverError && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {serverError}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Зарегистрироваться
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="font-medium text-slate-900 underline">
            Войти
          </Link>
        </p>
      </Card>
    </div>
  );
}
