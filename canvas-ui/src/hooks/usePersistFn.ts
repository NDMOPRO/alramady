import { useRef, useCallback } from "react";

export function usePersistFn<T extends (...args: unknown[]) => unknown>(fn: T): T {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const persistFn = useCallback((...args: unknown[]) => {
    return fnRef.current(...args);
  }, []);

  return persistFn as T;
}
