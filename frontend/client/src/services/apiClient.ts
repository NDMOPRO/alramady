/**
 * RASID API Client — اتصال مركزي بكل محركات المنصة
 * كل استدعاء يمر من هنا — JWT تلقائي، رسائل خطأ عربية
 */

const API_BASE = '';  // same-origin proxy via gateway

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string = 'UNKNOWN') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getToken(): string | null {
  try {
    const stored = localStorage.getItem('rasid_auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || parsed.accessToken || null;
    }
  } catch { /* ignore */ }
  return null;
}

function getArabicError(status: number): string {
  switch (status) {
    case 400: return 'البيانات غير صالحة';
    case 401: return 'يجب تسجيل الدخول';
    case 403: return 'ليس لديك صلاحية لهذا الإجراء';
    case 404: return 'العنصر غير موجود';
    case 409: return 'البيانات موجودة مسبقاً';
    case 413: return 'حجم الملف كبير جداً';
    case 429: return 'طلبات كثيرة، حاول لاحقاً';
    case 500: return 'خطأ في الخادم';
    case 502: return 'الخدمة غير متاحة حالياً';
    case 503: return 'الخدمة تحت الصيانة';
    default: return 'حدث خطأ غير متوقع';
  }
}

export async function apiCall<T = unknown>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    isFormData?: boolean;
    timeout?: number;
  } = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, isFormData = false, timeout = 30000 } = options;

  const token = getToken();
  const reqHeaders: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: reqHeaders,
      body: isFormData ? (body as FormData) : (body ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      let errorMessage = getArabicError(res.status);
      let errorCode = 'HTTP_ERROR';
      try {
        const errBody = await res.json();
        errorMessage = errBody.error || errBody.message || errorMessage;
        errorCode = errBody.code || errorCode;
      } catch { /* use default */ }

      // Auto-logout on 401
      if (res.status === 401) {
        localStorage.removeItem('rasid_auth');
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }

      throw new ApiError(errorMessage, res.status, errorCode);
    }

    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await res.json();
    }
    return (await res.blob()) as unknown as T;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof ApiError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new ApiError('انتهت مهلة الاتصال', 408, 'TIMEOUT');
    }
    throw new ApiError('فشل الاتصال بالخادم', 0, 'NETWORK');
  }
}

export async function uploadFile<T = unknown>(endpoint: string, file: File, extraFields?: Record<string, string>): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  if (extraFields) {
    Object.entries(extraFields).forEach(([k, v]) => form.append(k, v));
  }
  return apiCall<T>(endpoint, { method: 'POST', body: form, isFormData: true, timeout: 120000 });
}

export async function streamResponse(
  endpoint: string,
  body: unknown,
  onChunk: (text: string) => void,
  onDone?: (data?: unknown) => void,
  onError?: (error: string) => void
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    onError?.(getArabicError(res.status));
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { onError?.('لا يوجد بيانات'); return; }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'chunk') onChunk(data.content || '');
        else if (data.type === 'done') onDone?.(data);
        else if (data.type === 'error') onError?.(data.error || 'خطأ');
      } catch { /* skip non-JSON lines */ }
    }
  }
}
