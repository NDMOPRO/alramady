/**
 * Rasid Platform - Shared API Client
 *
 * Provides a typed HTTP client for inter-service communication.
 * Each microservice uses this to call other services internally.
 *
 * Usage:
 *   import { createServiceClient } from '@rasid/shared/utils/api-client';
 *   const dataClient = createServiceClient('data', { port: 8001 });
 *   const datasets = await dataClient.get('/datasets', { page: 1, pageSize: 10 });
 */

import type {
  ApiResponse,
  ApiErrorResponse,
  PaginatedResponse,
  HealthCheckResponse,
} from '../types/api-responses';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceClientConfig {
  /** Service slug (matches nginx upstream naming) */
  service: string;
  /** Base host. Defaults to `{service}-service` for Docker networking */
  host?: string;
  /** Service port */
  port: number;
  /** Request timeout in milliseconds. Default: 30000 */
  timeoutMs?: number;
  /** Number of retries on failure. Default: 2 */
  retries?: number;
  /** Base delay between retries in ms (exponential backoff). Default: 500 */
  retryDelayMs?: number;
  /** Additional default headers */
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  /** Override timeout for this specific request */
  timeoutMs?: number;
  /** Additional headers for this request */
  headers?: Record<string, string>;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
  /** Skip retries for this request */
  noRetry?: boolean;
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ServiceCallError extends Error {
  constructor(
    public readonly service: string,
    public readonly statusCode: number,
    public readonly errorBody: ApiErrorResponse | null,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceCallError';
  }
}

export class ServiceTimeoutError extends Error {
  constructor(
    public readonly service: string,
    public readonly url: string,
    public readonly timeoutMs: number,
  ) {
    super(`Request to ${service} timed out after ${timeoutMs}ms: ${url}`);
    this.name = 'ServiceTimeoutError';
  }
}

// ---------------------------------------------------------------------------
// Client implementation
// ---------------------------------------------------------------------------

export class ServiceClient {
  private readonly baseUrl: string;
  private readonly config: Required<
    Pick<ServiceClientConfig, 'timeoutMs' | 'retries' | 'retryDelayMs'>
  > &
    ServiceClientConfig;

  constructor(config: ServiceClientConfig) {
    const host = config.host || `${config.service}-service`;
    this.baseUrl = `http://${host}:${config.port}/api/v1/${config.service}`;
    this.config = {
      timeoutMs: 30000,
      retries: 2,
      retryDelayMs: 500,
      ...config,
    };
  }

  // ---- Public HTTP methods ----

  async get<T = unknown>(
    path: string,
    query?: QueryParams,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<ApiResponse<T>>('GET', path, undefined, query, options);
  }

  async getList<T = unknown>(
    path: string,
    query?: QueryParams,
    options?: RequestOptions,
  ): Promise<PaginatedResponse<T>> {
    return this.request<PaginatedResponse<T>>('GET', path, undefined, query, options);
  }

  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<ApiResponse<T>>('POST', path, body, undefined, options);
  }

  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<ApiResponse<T>>('PUT', path, body, undefined, options);
  }

  async patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<ApiResponse<T>>('PATCH', path, body, undefined, options);
  }

  async delete<T = unknown>(
    path: string,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<ApiResponse<T>>('DELETE', path, undefined, undefined, options);
  }

  async health(options?: RequestOptions): Promise<HealthCheckResponse> {
    return this.request<HealthCheckResponse>('GET', '/health', undefined, undefined, options);
  }

  // ---- Internal ----

  private buildUrl(path: string, query?: QueryParams): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: QueryParams,
    options?: RequestOptions,
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;
    const maxRetries = options?.noRetry ? 0 : this.config.retries;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeRequest<T>(method, url, body, timeoutMs, options);
        return result;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry on client errors (4xx)
        if (err instanceof ServiceCallError && err.statusCode >= 400 && err.statusCode < 500) {
          throw err;
        }

        // Don't retry if aborted
        if (lastError.name === 'AbortError') {
          throw lastError;
        }

        if (attempt < maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  private async executeRequest<T>(
    method: string,
    url: string,
    body: unknown,
    timeoutMs: number,
    options?: RequestOptions,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Combine signals if caller provided one
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Service-Caller': this.config.service,
      'X-Request-Time': new Date().toISOString(),
      ...this.config.defaultHeaders,
      ...options?.headers,
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timer);

      if (!response.ok) {
        let errorBody: ApiErrorResponse | null = null;
        try {
          errorBody = (await response.json()) as ApiErrorResponse;
        } catch {
          // Response may not be JSON
        }
        throw new ServiceCallError(
          this.config.service,
          response.status,
          errorBody,
          `${method} ${url} returned ${response.status}`,
        );
      }

      const data = (await response.json()) as T;
      return data;
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof ServiceCallError) throw err;

      const error = err instanceof Error ? err : new Error(String(err));
      if (error.name === 'AbortError') {
        throw new ServiceTimeoutError(this.config.service, url, timeoutMs);
      }
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Create a typed service client for inter-service communication.
 */
export function createServiceClient(
  service: string,
  config: Omit<ServiceClientConfig, 'service'>,
): ServiceClient {
  return new ServiceClient({ service, ...config });
}

/**
 * Pre-configured clients for all 13 Rasid services.
 * Uses Docker service names for host resolution.
 */
export const serviceClients = {
  data: () => createServiceClient('data', { port: 8001 }),
  excel: () => createServiceClient('excel', { port: 8002 }),
  dashboard: () => createServiceClient('dashboard', { port: 8003 }),
  reporting: () => createServiceClient('reporting', { port: 8004 }),
  presentation: () => createServiceClient('presentation', { port: 8005 }),
  infographic: () => createServiceClient('infographic', { port: 8006 }),
  replication: () => createServiceClient('replication', { port: 8007 }),
  localization: () => createServiceClient('localization', { port: 8008 }),
  ai: () => createServiceClient('ai', { port: 8009 }),
  governance: () => createServiceClient('governance', { port: 8010 }),
  library: () => createServiceClient('library', { port: 8011 }),
  template: () => createServiceClient('template', { port: 8012 }),
  conversion: () => createServiceClient('conversion', { port: 8013 }),
} as const;

export type ServiceName = keyof typeof serviceClients;

/**
 * Get a client by service name string.
 */
export function getServiceClient(name: ServiceName): ServiceClient {
  return serviceClients[name]();
}
