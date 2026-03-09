'use client';

import React, { useState, FormEvent } from 'react';
import Link from 'next/link';
import { Mail, Lock, User, Building2, Eye, EyeOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useLocale } from '@/hooks/useLocale';
import { authApi } from '@/lib/api';

export default function RegisterForm() {
  const { t } = useLocale();

  const [form, setForm] = useState({
    name: '',
    email: '',
    organization: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = t('auth.nameRequired');
    if (!form.email.trim()) errors.email = t('auth.emailRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Invalid email';
    if (!form.password) errors.password = t('auth.passwordRequired');
    else if (form.password.length < 8) errors.password = t('auth.passwordMinLength');
    if (form.password !== form.confirmPassword) errors.confirmPassword = t('auth.passwordMismatch');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsLoading(true);
    try {
      await authApi.post('/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        organization: form.organization,
      });
      window.location.href = '/login';
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-rasid-600 text-2xl font-bold text-white">
          R
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('auth.registerTitle')}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {t('auth.registerSubtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <Input
          label={t('common.name')}
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          error={formErrors.name}
          iconStart={<User className="h-4 w-4" />}
          autoComplete="name"
        />

        <Input
          label={t('common.email')}
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          error={formErrors.email}
          iconStart={<Mail className="h-4 w-4" />}
          autoComplete="email"
          dir="ltr"
        />

        <Input
          label={t('common.organization')}
          value={form.organization}
          onChange={(e) => update('organization', e.target.value)}
          iconStart={<Building2 className="h-4 w-4" />}
        />

        <Input
          label={t('common.password')}
          type={showPassword ? 'text' : 'password'}
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
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
          autoComplete="new-password"
          dir="ltr"
        />

        <Input
          label={t('common.confirmPassword')}
          type={showPassword ? 'text' : 'password'}
          value={form.confirmPassword}
          onChange={(e) => update('confirmPassword', e.target.value)}
          error={formErrors.confirmPassword}
          iconStart={<Lock className="h-4 w-4" />}
          autoComplete="new-password"
          dir="ltr"
        />

        <Button type="submit" loading={isLoading} className="w-full" size="lg">
          {t('auth.signUp')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
        {t('auth.hasAccount')}{' '}
        <Link href="/login" className="font-medium text-rasid-600 hover:text-rasid-500">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}
