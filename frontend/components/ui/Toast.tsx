"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import {
  X,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
} from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration: number;
  createdAt: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (
    type: ToastType,
    message: string,
    options?: { title?: string; duration?: number }
  ) => void;
  removeToast: (id: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <AlertCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
};

const bgMap: Record<ToastType, string> = {
  success:
    "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20",
  error: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
  warning:
    "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20",
  info: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20",
};

const progressMap: Record<ToastType, string> = {
  success: "bg-green-500",
  error: "bg-red-500",
  warning: "bg-yellow-500",
  info: "bg-blue-500",
};

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (toast.duration <= 0) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - toast.createdAt;
      const remaining = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onRemove(toast.id);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [toast, onRemove]);

  return (
    <div
      className={`animate-slide-up relative overflow-hidden rounded-lg border shadow-lg ${bgMap[toast.type]}`}
      role="alert"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="shrink-0 pt-0.5">{iconMap[toast.type]}</div>
        <div className="min-w-0 flex-1">
          {toast.title && (
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {toast.title}
            </p>
          )}
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {toast.message}
          </p>
        </div>
        <button
          onClick={() => onRemove(toast.id)}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      {toast.duration > 0 && (
        <div className="h-0.5 w-full bg-black/5 dark:bg-white/5">
          <div
            className={`h-full transition-all duration-100 ${progressMap[toast.type]}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (
      type: ToastType,
      message: string,
      options?: { title?: string; duration?: number }
    ) => {
      const id = `toast-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const duration = options?.duration ?? 5000;
      const toast: Toast = {
        id,
        type,
        title: options?.title,
        message,
        duration,
        createdAt: Date.now(),
      };
      setToasts((prev) => [...prev, toast]);
    },
    []
  );

  const success = useCallback(
    (message: string, title?: string) => addToast("success", message, { title }),
    [addToast]
  );
  const error = useCallback(
    (message: string, title?: string) => addToast("error", message, { title }),
    [addToast]
  );
  const warning = useCallback(
    (message: string, title?: string) => addToast("warning", message, { title }),
    [addToast]
  );
  const info = useCallback(
    (message: string, title?: string) => addToast("info", message, { title }),
    [addToast]
  );

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, success, error, warning, info }}
    >
      {children}
      {/* Toast container - bottom end (respects RTL) */}
      <div className="fixed bottom-4 end-4 z-[200] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
