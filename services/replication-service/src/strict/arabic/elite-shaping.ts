/**
 * Arabic ELITE Typography — Section 7
 *
 * MUST use Unicode Bidirectional Algorithm (UAX#9) deterministically.
 * MUST use shaping engine with pinned version & config.
 * MUST compute: glyph ids, advances, offsets, baseline offsets,
 *               line breaks, justification (kashida).
 * MUST store glyph_positions_emu in CDR for ELITE mode.
 */

import type {
  TextElementData,
  TextShaping,
  BidiRun,
  TextRun,
  ArabicMode,
} from '../cdr/types';
import { EMU_PER_INCH } from '../cdr/types';

// ─── Unicode Bidi (UAX#9 simplified) ─────────────────────────────────
const ARABIC_RANGE_START = 0x0600;
const ARABIC_RANGE_END = 0x06FF;
const ARABIC_SUPPLEMENT_START = 0x0750;
const ARABIC_SUPPLEMENT_END = 0x077F;
const ARABIC_PRESENTATION_A_START = 0xFB50;
const ARABIC_PRESENTATION_A_END = 0xFDFF;
const ARABIC_PRESENTATION_B_START = 0xFE70;
const ARABIC_PRESENTATION_B_END = 0xFEFF;

export function isArabicCodepoint(cp: number): boolean {
  return (
    (cp >= ARABIC_RANGE_START && cp <= ARABIC_RANGE_END) ||
    (cp >= ARABIC_SUPPLEMENT_START && cp <= ARABIC_SUPPLEMENT_END) ||
    (cp >= ARABIC_PRESENTATION_A_START && cp <= ARABIC_PRESENTATION_A_END) ||
    (cp >= ARABIC_PRESENTATION_B_START && cp <= ARABIC_PRESENTATION_B_END)
  );
}

export function isLatinCodepoint(cp: number): boolean {
  return (cp >= 0x0041 && cp <= 0x005A) || (cp >= 0x0061 && cp <= 0x007A) ||
    (cp >= 0x00C0 && cp <= 0x024F);
}

export function isDigit(cp: number): boolean {
  return (cp >= 0x0030 && cp <= 0x0039) || // ASCII digits
    (cp >= 0x0660 && cp <= 0x0669) || // Arabic-Indic digits
    (cp >= 0x06F0 && cp <= 0x06F9);   // Extended Arabic-Indic digits
}

// ─── Bidi Run Detection ──────────────────────────────────────────────
export function detectBidiRuns(text: string): BidiRun[] {
  const runs: BidiRun[] = [];
  if (text.length === 0) return runs;

  let currentDirection: 'LTR' | 'RTL' = 'LTR';
  let runStart = 0;
  let level = 0;

  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    let charDir: 'LTR' | 'RTL' | 'NEUTRAL';

    if (isArabicCodepoint(cp)) {
      charDir = 'RTL';
    } else if (isLatinCodepoint(cp)) {
      charDir = 'LTR';
    } else if (isDigit(cp)) {
      charDir = 'LTR'; // digits are always LTR in UAX#9
    } else {
      charDir = 'NEUTRAL';
    }

    if (charDir !== 'NEUTRAL' && charDir !== currentDirection && i > runStart) {
      runs.push({
        start: runStart,
        end: i,
        level: currentDirection === 'RTL' ? 1 : 0,
        direction: currentDirection,
      });
      runStart = i;
    }

    if (charDir !== 'NEUTRAL') {
      currentDirection = charDir;
      level = charDir === 'RTL' ? 1 : 0;
    }
  }

  // Final run
  runs.push({
    start: runStart,
    end: text.length,
    level,
    direction: currentDirection,
  });

  return runs;
}

// ─── Arabic Shaping ──────────────────────────────────────────────────
/** Arabic joining types */
type JoiningType = 'D' | 'R' | 'C' | 'L' | 'T' | 'U';

/** Simplified joining type lookup */
function getJoiningType(cp: number): JoiningType {
  // Most Arabic letters are dual-joining (D)
  // Some are right-joining only (R): alef, dal, thal, ra, zain, waw
  const rightJoiningOnly = [
    0x0627, // ALEF
    0x0623, // ALEF WITH HAMZA ABOVE
    0x0625, // ALEF WITH HAMZA BELOW
    0x0622, // ALEF WITH MADDA
    0x062F, // DAL
    0x0630, // THAL
    0x0631, // RA
    0x0632, // ZAIN
    0x0648, // WAW
    0x0624, // WAW WITH HAMZA
  ];

  if (rightJoiningOnly.includes(cp)) return 'R';
  if (isArabicCodepoint(cp)) return 'D';
  return 'U'; // non-joining
}

/** Determine contextual form for Arabic character */
export type ArabicForm = 'isolated' | 'initial' | 'medial' | 'final';

export function determineArabicForms(text: string): ArabicForm[] {
  const forms: ArabicForm[] = [];
  const codepoints: number[] = [];

  for (let i = 0; i < text.length; i++) {
    codepoints.push(text.codePointAt(i)!);
  }

  for (let i = 0; i < codepoints.length; i++) {
    const cp = codepoints[i];
    if (!isArabicCodepoint(cp)) {
      forms.push('isolated');
      continue;
    }

    const jt = getJoiningType(cp);
    const prevJoins = i > 0 && canJoinRight(getJoiningType(codepoints[i - 1]));
    const nextJoins = i < codepoints.length - 1 && canJoinLeft(getJoiningType(codepoints[i + 1]));

    if (jt === 'R') {
      // Right-joining only
      forms.push(prevJoins ? 'final' : 'isolated');
    } else if (jt === 'D') {
      // Dual-joining
      if (prevJoins && nextJoins) forms.push('medial');
      else if (prevJoins) forms.push('final');
      else if (nextJoins) forms.push('initial');
      else forms.push('isolated');
    } else {
      forms.push('isolated');
    }
  }

  return forms;
}

function canJoinRight(jt: JoiningType): boolean {
  return jt === 'D' || jt === 'R' || jt === 'C';
}

function canJoinLeft(jt: JoiningType): boolean {
  return jt === 'D' || jt === 'L' || jt === 'C';
}

// ─── Glyph Position Computation (ELITE) ──────────────────────────────
export interface GlyphPosition {
  glyph_id: number;
  x_advance_emu: number;
  y_advance_emu: number;
  x_offset_emu: number;
  y_offset_emu: number;
}

/**
 * Compute glyph positions for Arabic ELITE mode.
 * In production: delegates to HarfBuzz (pinned version) via WASM or native binding.
 */
export function computeGlyphPositions(
  text: string,
  fontSizeEmu: number,
  letterSpacingEmu: number,
  kerningEnabled: boolean,
): GlyphPosition[] {
  const positions: GlyphPosition[] = [];
  const forms = determineArabicForms(text);

  // Approximate advance width based on font size
  // In production: use actual font metrics from HarfBuzz
  const baseAdvance = Math.round(fontSizeEmu * 0.6);

  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    let advance = baseAdvance;

    // Arabic characters: form-dependent advance
    if (isArabicCodepoint(cp)) {
      switch (forms[i]) {
        case 'initial': advance = Math.round(baseAdvance * 0.8); break;
        case 'medial': advance = Math.round(baseAdvance * 0.7); break;
        case 'final': advance = Math.round(baseAdvance * 0.85); break;
        case 'isolated': advance = baseAdvance; break;
      }
    }

    // Kerning adjustment
    let kerningOffset = 0;
    if (kerningEnabled && i > 0) {
      // Simplified kerning — in production use font's GPOS table
      kerningOffset = 0;
    }

    positions.push({
      glyph_id: cp, // Simplified — real impl uses actual glyph IDs from font
      x_advance_emu: advance + letterSpacingEmu,
      y_advance_emu: 0,
      x_offset_emu: kerningOffset,
      y_offset_emu: 0,
    });
  }

  return positions;
}

// ─── Kashida Justification ───────────────────────────────────────────
/**
 * Apply kashida (tatweel) justification for Arabic text.
 * Only applied if source does it — MUST reproduce exactly.
 */
export function applyKashidaJustification(
  positions: GlyphPosition[],
  text: string,
  targetWidthEmu: number,
): GlyphPosition[] {
  const currentWidth = positions.reduce((sum, p) => sum + p.x_advance_emu, 0);
  const deficit = targetWidthEmu - currentWidth;
  if (deficit <= 0) return positions;

  // Find valid kashida insertion points (between Arabic characters)
  const insertionPoints: number[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    const cp = text.codePointAt(i)!;
    const nextCp = text.codePointAt(i + 1)!;
    if (isArabicCodepoint(cp) && isArabicCodepoint(nextCp)) {
      const jt = getJoiningType(cp);
      if (jt === 'D') {
        insertionPoints.push(i);
      }
    }
  }

  if (insertionPoints.length === 0) return positions;

  // Distribute kashida evenly across insertion points
  const kashidaPerPoint = Math.round(deficit / insertionPoints.length);
  const result = [...positions.map(p => ({ ...p }))];

  for (const point of insertionPoints) {
    result[point].x_advance_emu += kashidaPerPoint;
  }

  return result;
}

// ─── Full Shaping Pipeline ───────────────────────────────────────────
export function shapeText(
  text: string,
  runs: TextRun[],
  arabicMode: ArabicMode,
): TextShaping {
  const bidiRuns = detectBidiRuns(text);
  const glyphPositions: number[] = [];

  if (arabicMode === 'ELITE') {
    // Compute explicit glyph positioning
    for (const run of runs) {
      const segment = text.slice(run.range.start, run.range.end);
      const positions = computeGlyphPositions(
        segment,
        run.font_size_emu,
        run.letter_spacing_emu,
        run.kerning_enabled,
      );
      for (const pos of positions) {
        glyphPositions.push(pos.x_advance_emu);
      }
    }
  }

  return {
    arabic_mode: arabicMode,
    bidi_runs: bidiRuns,
    glyph_positions_emu: glyphPositions,
  };
}
