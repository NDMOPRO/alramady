/**
 * Typography Reshaping for RTL/LTR Direction Changes
 * Handles Arabic text shaping (joining behavior), ligature preservation,
 * baseline adjustments for Arabic script density, and Kashida justification.
 */

import { logger } from '../../utils/logger.js';

/** Text element to reshape */
export interface TextElement {
  id: string;
  text: string;
  direction: 'ltr' | 'rtl';
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lineHeight: number;
  letterSpacing: number;
  textAlign: 'start' | 'center' | 'end' | 'justify';
}

/** Reshaped text result */
export interface ReshapedText {
  elementId: string;
  originalText: string;
  shapedText: string;
  direction: 'ltr' | 'rtl';
  joinForms: JoinForm[];
  ligatures: Ligature[];
  baselineAdjustment: number;
  kashidaPositions: KashidaPosition[];
  metrics: ReshapingMetrics;
}

/** Character joining form */
export interface JoinForm {
  charIndex: number;
  character: string;
  form: 'isolated' | 'initial' | 'medial' | 'final';
  unicode: number;
}

/** A ligature replacement */
export interface Ligature {
  startIndex: number;
  endIndex: number;
  original: string;
  replacement: string;
  unicode: number;
}

/** Kashida insertion position */
export interface KashidaPosition {
  afterIndex: number;
  length: number;
  priority: number;
}

/** Metrics about the reshaping process */
export interface ReshapingMetrics {
  totalCharacters: number;
  arabicCharacters: number;
  ligaturesApplied: number;
  kashidaInsertions: number;
  baselineShift: number;
  directionChanged: boolean;
}

/** Arabic character joining ranges and forms */
const ARABIC_RANGE_START = 0x0600;
const ARABIC_RANGE_END = 0x06FF;
const KASHIDA = '\u0640';

/** Characters that only connect on the right (non-joining on left) */
const RIGHT_JOINING_ONLY = new Set([
  0x0627, // ALEF
  0x062F, // DAL
  0x0630, // THAL
  0x0631, // REH
  0x0632, // ZAIN
  0x0648, // WAW
  0x0629, // TEH MARBUTA
  0x0649, // ALEF MAKSURA
]);

/** Common Arabic ligatures */
const LIGATURE_MAP: Array<{ sequence: string; replacement: string; unicode: number }> = [
  { sequence: '\u0644\u0627', replacement: '\uFEFB', unicode: 0xFEFB }, // LAM-ALEF
  { sequence: '\u0644\u0623', replacement: '\uFEF7', unicode: 0xFEF7 }, // LAM-ALEF WITH HAMZA ABOVE
  { sequence: '\u0644\u0625', replacement: '\uFEF9', unicode: 0xFEF9 }, // LAM-ALEF WITH HAMZA BELOW
  { sequence: '\u0644\u0622', replacement: '\uFEF5', unicode: 0xFEF5 }, // LAM-ALEF WITH MADDA
];

/**
 * Checks if a character is in the Arabic Unicode block.
 */
function isArabicChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code >= ARABIC_RANGE_START && code <= ARABIC_RANGE_END;
}

/**
 * Checks if an Arabic character can join on its left side.
 */
function canJoinLeft(code: number): boolean {
  return !RIGHT_JOINING_ONLY.has(code) && code >= ARABIC_RANGE_START && code <= ARABIC_RANGE_END;
}

/**
 * Checks if an Arabic character can join on its right side.
 */
function canJoinRight(code: number): boolean {
  return code >= ARABIC_RANGE_START && code <= ARABIC_RANGE_END;
}

/**
 * Determines the joining form of each Arabic character based on context.
 */
function analyzeJoiningForms(text: string): JoinForm[] {
  const forms: JoinForm[] = [];
  const chars = Array.from(text);

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const code = char.codePointAt(0) ?? 0;

    if (!isArabicChar(char) || char === KASHIDA) {
      continue;
    }

    const prevCode = i > 0 ? (chars[i - 1].codePointAt(0) ?? 0) : 0;
    const nextCode = i < chars.length - 1 ? (chars[i + 1].codePointAt(0) ?? 0) : 0;

    const prevJoinsLeft = i > 0 && canJoinLeft(prevCode);
    const nextJoinsRight = i < chars.length - 1 && canJoinRight(nextCode);
    const thisJoinsLeft = canJoinLeft(code);

    let form: 'isolated' | 'initial' | 'medial' | 'final';

    if (prevJoinsLeft && nextJoinsRight && thisJoinsLeft) {
      form = 'medial';
    } else if (prevJoinsLeft) {
      form = 'final';
    } else if (nextJoinsRight && thisJoinsLeft) {
      form = 'initial';
    } else {
      form = 'isolated';
    }

    forms.push({ charIndex: i, character: char, form, unicode: code });
  }

  return forms;
}

/**
 * Detects and applies Arabic ligatures in the text.
 */
function detectLigatures(text: string): Ligature[] {
  const ligatures: Ligature[] = [];

  for (const lig of LIGATURE_MAP) {
    let searchFrom = 0;
    while (true) {
      const idx = text.indexOf(lig.sequence, searchFrom);
      if (idx === -1) break;

      ligatures.push({
        startIndex: idx,
        endIndex: idx + lig.sequence.length - 1,
        original: lig.sequence,
        replacement: lig.replacement,
        unicode: lig.unicode,
      });

      searchFrom = idx + lig.sequence.length;
    }
  }

  return ligatures.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Applies ligatures to text, replacing sequences with single ligature characters.
 */
function applyLigatures(text: string, ligatures: Ligature[]): string {
  if (ligatures.length === 0) return text;

  let result = '';
  let pos = 0;
  const sorted = [...ligatures].sort((a, b) => a.startIndex - b.startIndex);

  for (const lig of sorted) {
    if (lig.startIndex < pos) continue;
    result += text.slice(pos, lig.startIndex);
    result += lig.replacement;
    pos = lig.endIndex + 1;
  }

  result += text.slice(pos);
  return result;
}

/**
 * Calculates baseline adjustment for Arabic script density.
 * Arabic text typically needs a lower baseline due to deeper descenders
 * and more vertical variation in character forms.
 */
function calculateBaselineAdjustment(
  text: string,
  fontSize: number,
  targetDirection: 'ltr' | 'rtl'
): number {
  const chars = Array.from(text);
  const arabicCount = chars.filter(isArabicChar).length;
  const arabicRatio = chars.length > 0 ? arabicCount / chars.length : 0;

  if (arabicRatio < 0.1) return 0;

  const hasDiacritics = chars.some(c => {
    const code = c.codePointAt(0) ?? 0;
    return code >= 0x064B && code <= 0x065F;
  });

  let shift = fontSize * 0.05 * arabicRatio;

  if (hasDiacritics) {
    shift += fontSize * 0.08;
  }

  if (targetDirection === 'rtl') {
    shift *= 1.1;
  }

  return Math.round(shift * 100) / 100;
}

/**
 * Identifies optimal positions for Kashida extension to achieve justified text.
 * Kashida is preferred over inter-word spacing for Arabic justification.
 */
function findKashidaPositions(text: string, targetWidth: number, currentWidth: number): KashidaPosition[] {
  const deficit = targetWidth - currentWidth;
  if (deficit <= 0) return [];

  const positions: KashidaPosition[] = [];
  const chars = Array.from(text);

  const priorityPairs: Array<{ after: number; priority: number }> = [];

  for (let i = 0; i < chars.length - 1; i++) {
    const code = chars[i].codePointAt(0) ?? 0;
    const nextCode = chars[i + 1].codePointAt(0) ?? 0;

    if (!isArabicChar(chars[i]) || !isArabicChar(chars[i + 1])) continue;

    let priority = 1;

    if (canJoinLeft(code) && canJoinRight(nextCode)) {
      priority = 3;
    }

    if (code === 0x0628 || code === 0x062A || code === 0x062B ||
        code === 0x0633 || code === 0x0634 || code === 0x0635 ||
        code === 0x0636 || code === 0x0637 || code === 0x0638) {
      priority = 5;
    }

    if (RIGHT_JOINING_ONLY.has(nextCode)) {
      priority = Math.max(priority - 2, 1);
    }

    priorityPairs.push({ after: i, priority });
  }

  priorityPairs.sort((a, b) => b.priority - a.priority);

  const totalPriority = priorityPairs.reduce((s, p) => s + p.priority, 0);
  if (totalPriority === 0) return [];

  for (const pair of priorityPairs) {
    const kashidaLength = Math.max(1, Math.round((pair.priority / totalPriority) * deficit));
    positions.push({
      afterIndex: pair.after,
      length: kashidaLength,
      priority: pair.priority,
    });
  }

  return positions;
}

/**
 * Reshapes typography for text elements when changing text direction.
 * Handles Arabic joining behavior, ligatures, baseline adjustments,
 * and Kashida justification.
 */
export function reshapeTypography(
  textElements: TextElement[],
  targetDirection: 'ltr' | 'rtl'
): ReshapedText[] {
  logger.info('Starting typography reshaping', {
    elementCount: textElements.length,
    targetDirection,
  });

  const results: ReshapedText[] = [];

  for (const element of textElements) {
    const directionChanged = element.direction !== targetDirection;
    const joinForms = analyzeJoiningForms(element.text);
    const ligatures = detectLigatures(element.text);
    const shapedText = applyLigatures(element.text, ligatures);

    const baselineAdjustment = calculateBaselineAdjustment(
      element.text,
      element.fontSize,
      targetDirection
    );

    let kashidaPositions: KashidaPosition[] = [];
    if (element.textAlign === 'justify') {
      const estimatedCharWidth = element.fontSize * 0.55;
      const currentWidth = shapedText.length * estimatedCharWidth;
      kashidaPositions = findKashidaPositions(shapedText, element.width, currentWidth);
    }

    const chars = Array.from(element.text);
    const arabicCount = chars.filter(isArabicChar).length;

    results.push({
      elementId: element.id,
      originalText: element.text,
      shapedText,
      direction: targetDirection,
      joinForms,
      ligatures,
      baselineAdjustment,
      kashidaPositions,
      metrics: {
        totalCharacters: chars.length,
        arabicCharacters: arabicCount,
        ligaturesApplied: ligatures.length,
        kashidaInsertions: kashidaPositions.length,
        baselineShift: baselineAdjustment,
        directionChanged,
      },
    });
  }

  const totalLigatures = results.reduce((s, r) => s + r.metrics.ligaturesApplied, 0);
  const totalKashida = results.reduce((s, r) => s + r.metrics.kashidaInsertions, 0);

  logger.info('Typography reshaping complete', {
    elementsProcessed: results.length,
    totalLigatures,
    totalKashida,
    targetDirection,
  });

  return results;
}
