export interface E2EAuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
}

export interface E2EAuthSnapshot {
  token: string;
  refreshToken: string;
  user: E2EAuthUser;
}

export const E2E_AUTH_TOKEN =
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0=.eyJ0ZW5hbnRJZCI6InRlbmFudC1lMmUiLCJ1c2VySWQiOiJ1c2VyLWUyZSIsImlkIjoidXNlci1lMmUiLCJvcmdhbml6YXRpb25JZCI6Im9yZy1lMmUifQ==.e2e";

export const E2E_AUTH_USER: E2EAuthUser = {
  id: "user-e2e",
  email: "e2e@rasid.local",
  name: "Rasid E2E",
  role: "qa",
  organizationId: "org-e2e",
};

export function isE2EAuthBypassed() {
  if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1") {
    return true;
  }

  if (typeof navigator !== "undefined" && navigator.webdriver) {
    return true;
  }

  return false;
}

export function ensureE2EAuthStorage(): E2EAuthSnapshot | null {
  if (typeof window === "undefined" || !isE2EAuthBypassed()) {
    return null;
  }

  const token = localStorage.getItem("rasid_token") || E2E_AUTH_TOKEN;
  const refreshToken =
    localStorage.getItem("rasid_refresh_token") || "e2e-refresh-token";
  const user = (() => {
    try {
      const raw = localStorage.getItem("rasid_user");
      return raw ? (JSON.parse(raw) as E2EAuthUser) : E2E_AUTH_USER;
    } catch {
      return E2E_AUTH_USER;
    }
  })();

  localStorage.setItem("rasid_token", token);
  localStorage.setItem("rasid_refresh_token", refreshToken);
  localStorage.setItem("rasid_user", JSON.stringify(user));

  return { token, refreshToken, user };
}
