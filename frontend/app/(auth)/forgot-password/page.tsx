"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Mail, Loader2, ArrowRight, CheckCircle } from "lucide-react";
import { forgotPassword } from "@/lib/api/governance";

const forgotSchema = z.object({
  email: z
    .string()
    .min(1, "البريد الإلكتروني مطلوب")
    .email("صيغة البريد الإلكتروني غير صحيحة"),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: (data: ForgotFormData) => forgotPassword({ email: data.email }),
  });

  const onSubmit = (data: ForgotFormData) => {
    mutation.mutate(data);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rasid-50 via-white to-accent-50 px-4 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="w-full max-w-md">
        {/* Logo and title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rasid-600 to-accent-600 text-3xl font-bold text-white shadow-lg shadow-rasid-500/30">
            R
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            استعادة كلمة المرور
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة تعيين كلمة المرور
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-700 dark:bg-gray-800">
          {mutation.isSuccess ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  تم إرسال الرابط بنجاح
                </h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  تحقق من بريدك الإلكتروني للحصول على رابط إعادة تعيين كلمة المرور.
                  إذا لم تجد الرسالة، تحقق من مجلد الرسائل غير المرغوب فيها.
                </p>
              </div>
              <Link
                href="/login"
                className="btn-primary mt-2 inline-flex items-center gap-2 px-6 py-2.5"
              >
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                <span>العودة لتسجيل الدخول</span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Server error */}
              {mutation.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {(mutation.error as { response?: { data?: { message?: string } } })?.response
                    ?.data?.message || "حدث خطأ. يرجى المحاولة مرة أخرى."}
                </div>
              )}

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

              {/* Submit button */}
              <button
                type="submit"
                disabled={mutation.isPending}
                className="btn-primary w-full py-3 text-base"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>جاري الإرسال...</span>
                  </>
                ) : (
                  <span>إرسال رابط الاستعادة</span>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          تذكرت كلمة المرور؟{" "}
          <Link
            href="/login"
            className="font-medium text-rasid-600 hover:text-rasid-500"
          >
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  );
}
