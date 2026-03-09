'use client';

import React, { useState, FormEvent } from 'react';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/hooks/useLocale';

export default function LoginForm() {
  const { login, isLoading, error, clearError } = useAuth();
  const { t, isRTL } = useLocale();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = t('auth.emailRequired');
    if (!password) errors.password = t('auth.passwordRequired');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (!validate()) return;

    try {
      await login(email, password);
      window.location.href = '/';
    } catch {
      // Error is handled in the store
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-rasid-600 text-2xl font-bold text-white">
          R
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('auth.loginTitle')}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {t('auth.loginSubtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <Input
          label={t('common.email')}
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin"
          error={formErrors.email}
          iconStart={<Mail className="h-4 w-4" />}
          autoComplete="email"
          dir="ltr"
        />

        <Input
          label={t('common.password')}
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="********"
          error={formErrors.password}
          iconStart={<Lock className="h-4 w-4" />}
          iconEnd={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
          autoComplete="current-password"
          dir="ltr"
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-rasid-600 focus:ring-rasid-500"
            />
            <span className="text-gray-600 dark:text-gray-400">
              {isRTL ? 'تذكرني' : 'Remember me'}
            </span>
          </label>
          <a
            href="#"
            className="text-sm font-medium text-rasid-600 hover:text-rasid-500"
          >
            {t('auth.forgotPassword')}
          </a>
        </div>

        <Button type="submit" loading={isLoading} className="w-full" size="lg">
          {t('auth.signIn')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
        {t('auth.noAccount')}{' '}
        <Link href="/register" className="font-medium text-rasid-600 hover:text-rasid-500">
          {t('auth.signUp')}
        </Link>
      </p>
    </div>
  );
}
