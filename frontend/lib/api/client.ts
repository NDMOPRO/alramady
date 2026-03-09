import axios, {
  type AxiosInstance,
  type AxiosError,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from "axios";

const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const BASE_URL =
  typeof window === "undefined"
    ? process.env.INTERNAL_API_URL || PUBLIC_API_URL || "http://localhost:80"
    : PUBLIC_API_URL;

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });
  failedQueue = [];
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("rasid_token");
}

export function getAuthPayload(): Record<string, unknown> | null {
  const token = getToken();
  if (!token) return null;

  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function setToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("rasid_token", token);
  }
}

function clearAuth(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("rasid_token");
    localStorage.removeItem("rasid_user");
    localStorage.removeItem("rasid_refresh_token");
  }
}

/**
 * Creates an Axios instance configured for a specific API base path.
 * Includes JWT authorization and automatic token refresh.
 */
export function createApiClient(basePath: string): AxiosInstance {
  const client = axios.create({
    baseURL: `${BASE_URL}${basePath}`,
    timeout: 30000,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  // ── Request interceptor: attach JWT token + tenant header ─────────
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = getToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
        // Extract tenantId from JWT payload for services that require x-tenant-id
        const decoded = getAuthPayload();
        if (decoded?.tenantId) {
          config.headers["x-tenant-id"] = String(decoded.tenantId);
        }
        if (decoded?.userId || decoded?.id) {
          config.headers["x-user-id"] = String(decoded.userId || decoded.id);
        }
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // ── Response interceptor: handle errors + token refresh ────────────
  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };

      // 401 Unauthorized: attempt token refresh
      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          // Queue this request until the token is refreshed
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              return client(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshToken =
            typeof window !== "undefined"
              ? localStorage.getItem("rasid_refresh_token")
              : null;

          if (!refreshToken) {
            throw new Error("No refresh token available");
          }

          const refreshResponse = await axios.post(
            `${BASE_URL}/api/v1/governance/auth/refresh`,
            { refreshToken }
          );

          const refreshPayload = refreshResponse.data.data || refreshResponse.data;
          const newToken = refreshPayload.token || refreshPayload.accessToken;
          setToken(newToken);
          processQueue(null, newToken);

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }

          return client(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          clearAuth();

          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }

          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      // 403 Forbidden
      if (error.response?.status === 403) {
        console.error("[API] Access forbidden:", originalRequest.url);
      }

      // 500 Internal Server Error
      if (error.response?.status === 500) {
        console.error("[API] Internal server error:", originalRequest.url);
      }

      // Network error
      if (!error.response && error.request) {
        console.error("[API] Network error - no response received");
      }

      return Promise.reject(error);
    }
  );

  return client;
}

// ── Pre-configured API clients for each service ──────────────────────
export const governanceApi = createApiClient("/api/v1/governance");
export const dataApi = createApiClient("/api/v1/data");
export const excelApi = createApiClient("/api/v1/excel");
export const dashboardApi = createApiClient("/api/v1/dashboard");
export const reportingApi = createApiClient("/api/v1/reporting");
export const presentationApi = createApiClient("/api/v1/presentation");
export const infographicApi = createApiClient("/api/v1/infographic");
export const replicationApi = createApiClient("/api/v1/replication");
export const localizationApi = createApiClient("/api/v1/localization");
export const aiApi = createApiClient("/api/v1/ai");
export const libraryApi = createApiClient("/api/v1/library");
export const templateApi = createApiClient("/api/v1/template");
export const conversionApi = createApiClient("/api/v1/conversion");
export const bridgeApi = createApiClient("/api/bridge");
export const trainingApi = createApiClient("/api/training");
export const intelligenceApi = createApiClient("/api/intelligence");

export default createApiClient;
