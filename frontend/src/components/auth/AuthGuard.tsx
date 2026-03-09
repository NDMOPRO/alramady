'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth-store';
import Spinner from '@/components/ui/Spinner';

const PUBLIC_PATHS = ['/login', '/register'];

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const pathname = usePathname();
  const initialize = useAuthStore((s) => s.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    initialize();
    setIsReady(true);
  }, [initialize]);

  // During SSR / hydration, render children to avoid layout shift
  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // If on a public path, always render
  if (isPublicPath) {
    return <>{children}</>;
  }

  // If not authenticated and not on a public path, redirect
  if (!isAuthenticated) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
