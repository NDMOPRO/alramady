export interface FeatureEntry {
  id: string;
  text: string;
  hash: string;
  sourceSection: string;
  sourceLine: number;
}

export const FEATURE_ID_MIN = 'F-000001';
export const FEATURE_ID_MAX = 'F-005412';
export const TOTAL_FEATURE_COUNT = 5412;

export function generateFeatureId(num: number): string {
  return `F-${String(num).padStart(6, '0')}`;
}

export function parseFeatureId(id: string): number {
  return parseInt(id.replace('F-', ''), 10);
}

export function isValidFeatureId(id: string): boolean {
  const match = /^F-(\d{6})$/.exec(id);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return num >= 1 && num <= TOTAL_FEATURE_COUNT;
}
