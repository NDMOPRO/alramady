import routeConfig from "./routes.config.cjs";

export type PrimaryPageId =
  | "home"
  | "data"
  | "analysis"
  | "reports"
  | "presentations"
  | "library"
  | "settings";

export interface PrimaryNavItem {
  id: PrimaryPageId;
  nameAr: string;
  href: string;
  prefixes: string[];
}

export interface LegacyRouteRule {
  pattern: string;
  target: string;
  preserveQuery: boolean;
  contextParam?: string;
  contextValue?: string;
  extraQuery?: Record<string, string>;
}

export const primaryPageIds = routeConfig.primaryPageIds as PrimaryPageId[];
export const primaryNavItems = routeConfig.primaryNavItems as PrimaryNavItem[];
export const legacyRouteRules = routeConfig.legacyRouteRules as LegacyRouteRule[];

export function resolvePrimaryPage(pathname: string): PrimaryPageId {
  if (pathname === "/" || pathname.startsWith("/home")) return "home";

  const found = primaryNavItems.find(
    (item) => item.id !== "home" && item.prefixes.some((prefix) => pathname.startsWith(prefix))
  );
  return found?.id ?? "home";
}

export function resolvePrimaryTitle(pathname: string): string {
  const id = resolvePrimaryPage(pathname);
  return primaryNavItems.find((item) => item.id === id)?.nameAr ?? "الرئيسية";
}
