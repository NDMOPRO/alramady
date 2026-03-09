"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { registerUser } from "@/lib/api/governance";
import { useToast } from "@/components/ui/Toast";
import { OFFICIAL_MARK_URL, OFFICIAL_PLATFORM_NAME } from "@/lib/branding";

const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, "الاسم الكامل مطلوب")
      .min(3, "الاسم يجب أن يكون 3 أحرف على الأقل"),
    email: z
      .string()
      .min(1, "البريد الإلكتروني مطلوب")
      .email("صيغة البريد الإلكتروني غير صحيحة"),
    password: z
      .string()
      .min(1, "كلمة المرور مطلوبة")
      .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
      .regex(/[A-Z]/, "يجب أن تحتوي على حرف كبير واحد على الأقل")
      .regex(/[0-9]/, "يجب أن تحتوي على رقم واحد على الأقل"),
    confirmPassword: z.string().min(1, "تأكيد كلمة المرور مطلوب"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: (data: RegisterFormData) =>
      registerUser({ name: data.name, email: data.email, password: data.password }),
    onSuccess: (response) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("rasid_token", response.token);
        localStorage.setItem("rasid_refresh_token", response.refreshToken);
        localStorage.setItem("rasid_user", JSON.stringify(response.user));
      }
      toast.success("تم إنشاء الحساب بنجاح");
      router.push("/home");
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(
        error?.response?.data?.message || "فشل إنشاء الحساب. يرجى المحاولة مرة أخرى."
      );
    },
  });

  const onSubmit = (data: RegisterFormData) => {
    mutation.mutate(data);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rasid-50 via-white to-accent-50 px-4 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="w-full max-w-md">
        {/* Logo and title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/70 bg-white shadow-lg shadow-rasid-500/20">
            <img src={OFFICIAL_MARK_URL} alt={OFFICIAL_PLATFORM_NAME} className="h-14 w-14 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            إنشاء حساب جديد
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            سجّل في {OFFICIAL_PLATFORM_NAME} للبدء في استخدام الخدمات
          </p>
        </div>

        {/* Registration form card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Server error */}
            {mutation.isError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {(mutation.error as { response?: { data?: { message?: string } } })?.response?.data
                  ?.message || "حدث خطأ غير متوقع"}
              </div>
            )}

            {/* Name field */}
            <div>
              <label
                htmlFor="name"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                الاسم الكامل
              </label>
              <div className="relative">
                <UserPlus className="absolute start-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  id="name"
                  type="text"
                  placeholder="أدخل اسمك الكامل"
                  autoComplete="name"
                  className={`input-field ps-10 ${
                    errors.name
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : ""
                  }`}
                  {...register("name")}
                />
              </div>
              {errors.name && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Email field */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                البريد الإلكتروني
              </label>
              <div className="relative">
                <Mail className="absolute start-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  dir="ltr"
                  placeholder="user@example.com"
                  autoComplete="email"
                  className={`input-field ps-10 ${
                    errors.email
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : ""
                  }`}
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password field */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                كلمة المرور
              </label>
              <div className="relative">
                <Lock className="absolute start-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  dir="ltr"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`input-field ps-10 pe-10 ${
                    errors.password
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : ""
                  }`}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-3 top-3 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm password field */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                تأكيد كلمة المرور
              </label>
              <div className="relative">
                <Lock className="absolute start-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  dir="ltr"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`input-field ps-10 pe-10 ${
                    errors.confirmPassword
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : ""
                  }`}
                  {...register("confirmPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute end-3 top-3 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary w-full py-3 text-base"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>جاري إنشاء الحساب...</span>
                </>
              ) : (
                <span>إنشاء الحساب</span>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          لديك حساب بالفعل؟{" "}
          <Link
            href="/login"
            className="font-medium text-rasid-600 hover:text-rasid-500"
          >
            تسجيل الدخول
          </Link>
        </p>

        <p className="mt-4 text-center text-xs text-gray-400">
          {OFFICIAL_PLATFORM_NAME} &copy; {new Date().getFullYear()} - جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
