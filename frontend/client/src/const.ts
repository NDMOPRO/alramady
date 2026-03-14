// App constants
export const APP_NAME = "راصد البيانات";

/**
 * Build the Manus OAuth login URL.
 * Encodes the current origin + optional return path in the `state` parameter
 * so the OAuth callback can redirect back correctly.
 */
export function getLoginUrl(returnPath?: string): string {
  const portalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!portalUrl || !appId) {
    // Fallback: redirect to home
    return "/";
  }

  const origin = window.location.origin;
  const state = JSON.stringify({
    origin,
    returnPath: returnPath || window.location.pathname,
  });

  return `${portalUrl}?app_id=${appId}&state=${encodeURIComponent(state)}`;
}
