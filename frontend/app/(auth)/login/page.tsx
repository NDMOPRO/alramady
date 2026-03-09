"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { OFFICIAL_MARK_URL, OFFICIAL_PLATFORM_NAME, OFFICIAL_PLATFORM_TAGLINE } from "@/lib/branding";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "اسم المستخدم أو البريد الإلكتروني مطلوب"),
  password: z
    .string()
    .min(1, "كلمة المرور مطلوبة"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    try {
      await login(data.email, data.password);
      window.location.href = "/home";
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setServerError(
        error?.response?.data?.message ||
          "فشل تسجيل الدخول. يرجى المحاولة مرة أخرى."
      );
    }
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
            تسجيل الدخول إلى {OFFICIAL_PLATFORM_NAME}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {OFFICIAL_PLATFORM_TAGLINE}
          </p>
        </div>

        {/* Login form card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Server error */}
            {serverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {serverError}
              </div>
            )}

            {/* Email field */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                اسم المستخدم
              </label>
              <div className="relative">
                <Mail className="absolute start-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  id="email"
                  type="text"
                  dir="ltr"
                  placeholder="admin"
                  autoComplete="username"
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
                  autoComplete="current-password"
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

            {/* Remember me + Forgot password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-rasid-600 focus:ring-rasid-500"
                />
                <span className="text-gray-600 dark:text-gray-400">
                  تذكرني
                </span>
              </label>
              <a
                href="#"
                className="text-sm font-medium text-rasid-600 hover:text-rasid-500"
              >
                نسيت كلمة المرور؟
              </a>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3 text-base"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>جاري تسجيل الدخول...</span>
                </>
              ) : (
                <span>تسجيل الدخول</span>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          ليس لديك حساب؟{" "}
          <a
            href="/register"
            className="font-medium text-rasid-600 hover:text-rasid-500"
          >
            إنشاء حساب جديد
          </a>
        </p>

        <p className="mt-4 text-center text-xs text-gray-400">
          {OFFICIAL_PLATFORM_NAME} &copy; {new Date().getFullYear()} - جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
