'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

interface PendingOperation {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  body: unknown;
  createdAt: string;
}

interface SyncResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ operationId: string; error: string }>;
}

const STORAGE_KEY = 'rasid_offline_queue';

function generateId(): string {
  return Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8);
}

function loadQueue(): PendingOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingOperation[];
  } catch {
    return [];
  }
}

function saveQueue(queue: PendingOperation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingOperations, setPendingOperations] = useState<PendingOperation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncInProgress = useRef(false);

  const loadPending = useCallback(() => {
    const queue = loadQueue();
    setPendingOperations(queue);
  }, []);

  const queueOperation = useCallback(
    (method: PendingOperation['method'], url: string, body?: unknown) => {
      const operation: PendingOperation = {
        id: generateId(),
        method,
        url,
        body,
        createdAt: new Date().toISOString(),
      };
      const updated = [...loadQueue(), operation];
      saveQueue(updated);
      setPendingOperations(updated);
      return operation.id;
    },
    []
  );

  const removeOperation = useCallback((id: string) => {
    const updated = loadQueue().filter((op) => op.id !== id);
    saveQueue(updated);
    setPendingOperations(updated);
  }, []);

  const clearQueue = useCallback(() => {
    saveQueue([]);
    setPendingOperations([]);
  }, []);

  const syncNow = useCallback(async (): Promise<SyncResult> => {
    if (syncInProgress.current) {
      return { total: 0, succeeded: 0, failed: 0, errors: [] };
    }
    syncInProgress.current = true;
    setIsSyncing(true);
    setError(null);

    const queue = loadQueue();
    const result: SyncResult = {
      total: queue.length,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    const remaining: PendingOperation[] = [];

    for (const op of queue) {
      try {
        switch (op.method) {
          case 'GET':
            await api.get(op.url);
            break;
          case 'POST':
            await api.post(op.url, op.body);
            break;
          case 'PUT':
            await api.put(op.url, op.body);
            break;
          case 'DELETE':
            await api.del(op.url);
            break;
        }
        result.succeeded++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          operationId: op.id,
          error: err instanceof Error ? err.message : String(err),
        });
        remaining.push(op);
      }
    }

    saveQueue(remaining);
    setPendingOperations(remaining);
    setIsSyncing(false);
    syncInProgress.current = false;

    if (result.failed > 0) {
      setError(`${result.failed} of ${result.total} operations failed to sync`);
    }

    return result;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);
    loadPending();

    const handleOnline = () => {
      setIsOnline(true);
      syncNow();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadPending, syncNow]);

  return {
    isOnline,
    pendingCount: pendingOperations.length,
    pendingOperations,
    isSyncing,
    error,
    queueOperation,
    removeOperation,
    clearQueue,
    syncNow,
  };
}
