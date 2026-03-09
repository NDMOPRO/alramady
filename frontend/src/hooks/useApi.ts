'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AxiosInstance, AxiosRequestConfig } from 'axios';

interface UseApiState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

interface UseApiReturn<T> extends UseApiState<T> {
  refetch: () => Promise<void>;
  mutate: (data: T | null) => void;
}

export function useApi<T = any>(
  client: AxiosInstance,
  url: string,
  config?: AxiosRequestConfig,
  options?: { immediate?: boolean; deps?: any[] }
): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    error: null,
    isLoading: options?.immediate !== false,
  });

  const configRef = useRef(config);
  configRef.current = config;

  const fetchData = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await client.get<T>(url, configRef.current);
      setState({ data: response.data, error: null, isLoading: false });
    } catch (err: any) {
      const message =
        err.response?.data?.message || err.message || 'An error occurred';
      setState((prev) => ({ ...prev, error: message, isLoading: false }));
    }
  }, [client, url]);

  useEffect(() => {
    if (options?.immediate !== false) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, ...(options?.deps || [])]);

  const mutate = useCallback((data: T | null) => {
    setState((prev) => ({ ...prev, data }));
  }, []);

  return {
    ...state,
    refetch: fetchData,
    mutate,
  };
}

export function useApiMutation<TData = any, TPayload = any>(
  client: AxiosInstance,
  method: 'post' | 'put' | 'patch' | 'delete' = 'post'
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TData | null>(null);

  const execute = useCallback(
    async (url: string, payload?: TPayload, config?: AxiosRequestConfig) => {
      setIsLoading(true);
      setError(null);
      try {
        const response =
          method === 'delete'
            ? await client[method]<TData>(url, config)
            : await client[method]<TData>(url, payload, config);
        setData(response.data);
        setIsLoading(false);
        return response.data;
      } catch (err: any) {
        const message =
          err.response?.data?.message || err.message || 'An error occurred';
        setError(message);
        setIsLoading(false);
        throw err;
      }
    },
    [client, method]
  );

  return { execute, data, error, isLoading, setError };
}
