export const LOGOS = {
  rased6: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Rased(6)_transparent_eef266a0.png',
  rased1: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Rased(1)_transparent_377ecd39.png',
  rased4: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Rased(4)_transparent_e47d1a9c.png',
  rased1b: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Rased(1)_transparent(1)_7c0309ca.png',
  rased3: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Rased(3)_transparent_1739a9cb.png',
  rased5: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Rased(5)_transparent_ee7b5958.png',
  rased7: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Rased(7)_transparent_dc6ef005.png',
  rased4b: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Rased(4)_transparent(1)_cdf4db58.png',
  rased2b: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Rased(2)_transparent(1)_bc29a6ef.png',
  rased3b: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Rased(3)_transparent(1)_c4dd0492.png',
  char1: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Character_1_waving_transparent_679aece2.png',
  char3: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Character_3_dark_bg_transparent_2fee530a.png',
  char4: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Character_4_sunglasses_transparent_284d327f.png',
  char3b: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Character_3_dark_bg_transparent(1)_1e3e6577.png',
  char2: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Character_2_shmagh_transparent_d9e12079.png',
  char5: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Character_5_arms_crossed_shmagh_transparent_63ec8d47.png',
  char6: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663340926600/PmcyGk9yVwTWWL3H3qubaM/Character_6_standing_shmagh_transparent_6fa1d2c6.png',
};

export interface DesignConfig {
  id: number;
  name: string;
  nameEn: string;
  logo: string;
  character: string;
  description: string;
  hasNav?: boolean;
}

export const designs: DesignConfig[] = [
  {
    id: 1, name: 'الكلاسيكي الأنيق', nameEn: 'Elegant Classic',
    logo: LOGOS.rased1, character: LOGOS.char1,
    description: 'تصميم كلاسيكي مع هيدر علوي وفقاعات مستديرة وإدخال سفلي',
  },
];

export const getDesign = (id: number): DesignConfig => {
  return designs.find((d) => d.id === id) || designs[0];
};

export const LIGHT_COLORS = {
  bg: '#ffffff',
  bgSecondary: '#f8fafc',
  bgTertiary: '#f1f5f9',
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  blue: '#2563eb',
  blueLight: '#3b82f6',
  blueDark: '#1d4ed8',
  blueGlow: 'rgba(37, 99, 235, 0.25)',
  blueBg: 'rgba(37, 99, 235, 0.08)',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  shadow: 'rgba(15, 23, 42, 0.08)',
  shadowMd: 'rgba(15, 23, 42, 0.12)',
  userBubble: '#2563eb',
  userText: '#ffffff',
  aiBubble: '#f1f5f9',
  aiText: '#0f172a',
};

export const DARK_COLORS = {
  bg: '#0b1120',
  bgSecondary: '#111827',
  bgTertiary: '#1e293b',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  blue: '#3b82f6',
  blueLight: '#60a5fa',
  blueDark: '#2563eb',
  blueGlow: 'rgba(59, 130, 246, 0.35)',
  blueBg: 'rgba(59, 130, 246, 0.15)',
  border: 'rgba(148, 163, 184, 0.12)',
  borderLight: 'rgba(148, 163, 184, 0.06)',
  shadow: 'rgba(0, 0, 0, 0.3)',
  shadowMd: 'rgba(0, 0, 0, 0.5)',
  userBubble: '#2563eb',
  userText: '#ffffff',
  aiBubble: '#1e293b',
  aiText: '#f1f5f9',
};
