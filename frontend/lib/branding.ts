export const OFFICIAL_PLATFORM_NAME = "راصد";
export const OFFICIAL_PLATFORM_TAGLINE = "مكتب إدارة البيانات الوطنية";
export const OFFICIAL_MARK_URL = "/rasid-mark.svg";

const BRAND_ALIASES = new Set([
  "",
  "rasid",
  "rasid smart",
  "منصه راصد",
  "منصة راصد",
  "راصد الذكي",
  "رصيد",
]);

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export function resolvePlatformName(value?: string | null) {
  const raw = normalizeText(value);
  if (BRAND_ALIASES.has(raw)) {
    return OFFICIAL_PLATFORM_NAME;
  }

  return value?.trim() || OFFICIAL_PLATFORM_NAME;
}

export function resolvePlatformTagline(value?: string | null) {
  const next = value?.trim();
  if (!next) {
    return OFFICIAL_PLATFORM_TAGLINE;
  }

  if (["منصة راصد", "مركز القيادة"].includes(next)) {
    return OFFICIAL_PLATFORM_TAGLINE;
  }

  return next;
}

export function resolveLogoUrl(value?: string | null) {
  return value?.trim() || OFFICIAL_MARK_URL;
}
