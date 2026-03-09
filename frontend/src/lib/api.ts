const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost';

class RasidAPI {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rasid_token') : null;
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `API Error ${res.status}`);
    }
    return res.json();
  }

  get = <T>(url: string) => this.request<T>(url);
  post = <T>(url: string, body: unknown) => this.request<T>(url, { method: 'POST', body: JSON.stringify(body) });
  put = <T>(url: string, body: unknown) => this.request<T>(url, { method: 'PUT', body: JSON.stringify(body) });
  patch = <T>(url: string, body: unknown) => this.request<T>(url, { method: 'PATCH', body: JSON.stringify(body) });
  del = <T>(url: string) => this.request<T>(url, { method: 'DELETE' });

  upload = async <T>(url: string, formData: FormData): Promise<T> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rasid_token') : null;
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  };
}

export const api = new RasidAPI();

class AuthAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost') + '/api/v1/governance/auth';
  }

  async post(path: string, body?: unknown) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const error = new Error(err.error || err.message || `API Error ${res.status}`);
      (error as any).response = { data: err };
      throw error;
    }
    return res.json();
  }
}

export const authApi = new AuthAPI();
