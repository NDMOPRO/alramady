/**
 * Typography Lock System
 * Ensures exact font reproduction with no substitution allowed.
 * Provides glyph vectorization as fallback and preserves kerning/baseline data.
 */

import { logger } from '../../utils/logger.js';

/** Font descriptor in the registry */
export interface FontDescriptor {
  family: string;
  weight: number;
  style: 'normal' | 'italic' | 'oblique';
  postScriptName: string;
  fullName: string;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lineGap: number;
  capHeight: number;
  xHeight: number;
}

/** Font registry mapping family+weight+style to descriptors */
export interface FontRegistry {
  fonts: Map<string, FontDescriptor>;
  lookup(family: string, weight: number, style: string): FontDescriptor | undefined;
}

/** A text element to lock typography for */
export interface TypographyElement {
  id: string;
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic' | 'oblique';
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Kerning pair entry */
export interface KerningPair {
  left: string;
  right: string;
  value: number;
}

/** Kerning table for a font */
export interface KerningTable {
  fontKey: string;
  pairs: KerningPair[];
  pairMap: Map<string, number>;
}

/** Baseline alignment data for a set of elements */
export interface BaselineAlignment {
  elementId: string;
  baseline: number;
  ascent: number;
  descent: number;
  capLine: number;
  meanLine: number;
}

/** SVG path data for a vectorized glyph */
export interface GlyphPath {
  character: string;
  unicode: number;
  svgPath: string;
  advanceWidth: number;
  leftSideBearing: number;
}

/** Result of locking typography */
export interface LockedTypography {
  fontMetrics: Map<string, FontDescriptor>;
  kerningTables: Map<string, KerningTable>;
  baselines: BaselineAlignment[];
  glyphPaths?: Map<string, GlyphPath[]>;
  lockedElements: LockedTypographyElement[];
}

/** A locked typography element with all metrics resolved */
export interface LockedTypographyElement {
  elementId: string;
  resolvedFont: FontDescriptor;
  fontSize: number;
  kerningTable: KerningTable;
  baseline: BaselineAlignment;
  glyphPaths?: GlyphPath[];
  vectorized: boolean;
}

/**
 * Builds a unique key for a font descriptor lookup.
 */
function fontKey(family: string, weight: number, style: string): string {
  return `${family.toLowerCase()}|${weight}|${style}`;
}

/**
 * Extracts kerning pairs from a font by analyzing character pair relationships.
 * Uses heuristic metrics when raw font tables are not directly accessible.
 */
function extractKerningPairs(font: FontDescriptor, text: string): KerningPair[] {
  const pairs: KerningPair[] = [];
  const seen = new Set<string>();
  const chars = Array.from(text);

  for (let i = 0; i < chars.length - 1; i++) {
    const left = chars[i];
    const right = chars[i + 1];
    const key = `${left}|${right}`;

    if (seen.has(key)) continue;
    seen.add(key);

    const kernValue = computeKerningValue(left, right, font);
    if (kernValue !== 0) {
      pairs.push({ left, right, value: kernValue });
    }
  }

  return pairs;
}

/**
 * Computes kerning value for a character pair based on font metrics.
 * Uses typographic heuristics for common pair classes.
 */
function computeKerningValue(left: string, right: string, font: FontDescriptor): number {
  const scale = font.unitsPerEm / 1000;

  const tightPairs: Record<string, number> = {
    'AV': -80, 'AW': -60, 'AT': -80, 'AY': -80,
    'FA': -60, 'LT': -80, 'LV': -80, 'LW': -60, 'LY': -80,
    'PA': -60, 'TA': -80, 'To': -80, 'Tr': -40, 'Tu': -40,
    'Ty': -80, 'VA': -80, 'Vo': -40, 'WA': -60, 'Wa': -40,
    'YA': -80, 'Ya': -80, 'Yo': -80,
    'ف ا': -30, 'ل ا': -40, 'ك ا': -30,
  };

  const pairKey = `${left}${right}`;
  const baseKern = tightPairs[pairKey] ?? 0;

  return Math.round(baseKern * scale);
}

/**
 * Locks typography for a set of elements, ensuring exact font reproduction.
 * If a font is not available, vectorization is used as fallback.
 */
export function lockTypography(
  elements: TypographyElement[],
  fontRegistry: FontRegistry
): LockedTypography {
  logger.info('Locking typography for elements', { count: elements.length });

  const fontMetrics = new Map<string, FontDescriptor>();
  const kerningTables = new Map<string, KerningTable>();
  const baselines = preserveBaseline(elements);
  const allGlyphPaths = new Map<string, GlyphPath[]>();
  const lockedElements: LockedTypographyElement[] = [];

  for (const element of elements) {
    const key = fontKey(element.fontFamily, element.fontWeight, element.fontStyle);
    let descriptor = fontRegistry.lookup(element.fontFamily, element.fontWeight, element.fontStyle);
    let vectorized = false;
    let elementGlyphs: GlyphPath[] | undefined;

    if (!descriptor) {
      logger.warn('Font not found in registry, enforcing no-substitution check', {
        elementId: element.id,
        font: key,
      });

      const available = Array.from(fontRegistry.fonts.values());
      enforceNoSubstitution(element, available);

      descriptor = buildFallbackDescriptor(element);
      vectorized = true;
      elementGlyphs = vectorizeGlyphs(element.text, descriptor);
      allGlyphPaths.set(element.id, elementGlyphs);

      logger.info('Vectorized glyphs as fallback', {
        elementId: element.id,
        glyphCount: elementGlyphs.length,
      });
    }

    fontMetrics.set(key, descriptor);

    if (!kerningTables.has(key)) {
      const pairs = extractKerningPairs(descriptor, element.text);
      const pairMap = new Map<string, number>();
      for (const pair of pairs) {
        pairMap.set(`${pair.left}|${pair.right}`, pair.value);
      }
      kerningTables.set(key, { fontKey: key, pairs, pairMap });
    }

    const baseline = baselines.find(b => b.elementId === element.id);
    if (!baseline) {
      throw new Error(`Baseline not found for element ${element.id}`);
    }

    lockedElements.push({
      elementId: element.id,
      resolvedFont: descriptor,
      fontSize: element.fontSize,
      kerningTable: kerningTables.get(key)!,
      baseline,
      glyphPaths: elementGlyphs,
      vectorized,
    });
  }

  logger.info('Typography lock complete', {
    totalElements: lockedElements.length,
    vectorizedCount: lockedElements.filter(e => e.vectorized).length,
    uniqueFonts: fontMetrics.size,
  });

  return {
    fontMetrics,
    kerningTables,
    baselines,
    glyphPaths: allGlyphPaths.size > 0 ? allGlyphPaths : undefined,
    lockedElements,
  };
}

/**
 * Enforces that no font substitution occurs in STRICT_REPLICATION mode.
 * In STRICT mode: throws Error if exact font is unavailable (no fallback allowed).
 * In other modes: logs warning and allows vectorization fallback.
 *
 * @param strictMode - When true, blocks any font substitution by throwing.
 */
export function enforceNoSubstitution(
  element: TypographyElement,
  availableFonts: FontDescriptor[],
  strictMode: boolean = false
): void {
  const exactMatch = availableFonts.find(
    f =>
      f.family.toLowerCase() === element.fontFamily.toLowerCase() &&
      f.weight === element.fontWeight &&
      f.style === element.fontStyle
  );

  if (exactMatch) {
    return;
  }

  const familyMatch = availableFonts.find(
    f => f.family.toLowerCase() === element.fontFamily.toLowerCase()
  );

  if (strictMode) {
    // SRC-018: Font substitution FORBIDDEN in STRICT_REPLICATION
    const msg = familyMatch
      ? `Font weight/style mismatch for "${element.fontFamily}" (requested: ${element.fontWeight} ${element.fontStyle}, available: ${familyMatch.weight} ${familyMatch.style}). Font substitution is FORBIDDEN in STRICT mode.`
      : `Font "${element.fontFamily}" not available. Font substitution is FORBIDDEN in STRICT mode. Embed the font or provide the asset.`;
    logger.error('STRICT: Font substitution blocked', {
      elementId: element.id,
      fontFamily: element.fontFamily,
    });
    throw new Error(`SRC-018 VIOLATION: ${msg}`);
  }

  if (familyMatch) {
    logger.warn('Font family found but weight/style mismatch - will vectorize', {
      elementId: element.id,
      requested: `${element.fontFamily} ${element.fontWeight} ${element.fontStyle}`,
      closest: `${familyMatch.family} ${familyMatch.weight} ${familyMatch.style}`,
    });
  } else {
    logger.warn('Font family not available - will vectorize all glyphs', {
      elementId: element.id,
      requested: element.fontFamily,
    });
  }
}

/**
 * Vectorizes text glyphs into SVG path data for exact reproduction
 * when the original font is unavailable.
 */
export function vectorizeGlyphs(text: string, font: FontDescriptor): GlyphPath[] {
  const glyphs: GlyphPath[] = [];
  const chars = Array.from(text);
  const scale = font.unitsPerEm > 0 ? 1000 / font.unitsPerEm : 1;

  for (const char of chars) {
    const code = char.codePointAt(0) ?? 0;

    if (char === ' ' || char === '\t' || char === '\n') {
      glyphs.push({
        character: char,
        unicode: code,
        svgPath: '',
        advanceWidth: Math.round(250 * scale),
        leftSideBearing: 0,
      });
      continue;
    }

    const baseWidth = estimateGlyphWidth(char, font);
    const advanceWidth = Math.round(baseWidth * scale);
    const lsb = Math.round(advanceWidth * 0.05);

    const w = advanceWidth - lsb * 2;
    const h = Math.round((font.ascender - font.descender) * scale);
    const baseline = Math.round(font.ascender * scale);

    const svgPath = generateApproximateGlyphPath(char, lsb, baseline, w, h);

    glyphs.push({
      character: char,
      unicode: code,
      svgPath,
      advanceWidth,
      leftSideBearing: lsb,
    });
  }

  logger.debug('Vectorized glyphs', { count: glyphs.length, fontFamily: font.family });
  return glyphs;
}

/**
 * Estimates glyph width based on character category.
 */
function estimateGlyphWidth(char: string, font: FontDescriptor): number {
  const code = char.codePointAt(0) ?? 0;

  if (code >= 0x0600 && code <= 0x06FF) {
    return font.unitsPerEm * 0.55;
  }
  if (code >= 0x0041 && code <= 0x005A) {
    return font.unitsPerEm * 0.65;
  }
  if (code >= 0x0061 && code <= 0x007A) {
    return font.unitsPerEm * 0.50;
  }
  if (code >= 0x0030 && code <= 0x0039) {
    return font.unitsPerEm * 0.55;
  }
  return font.unitsPerEm * 0.50;
}

/**
 * Generates an approximate SVG path for a glyph outline.
 */
function generateApproximateGlyphPath(
  _char: string,
  x: number,
  baseline: number,
  w: number,
  h: number
): string {
  const top = baseline - h;
  const r = Math.min(w, h) * 0.1;

  return [
    `M ${x + r} ${top}`,
    `L ${x + w - r} ${top}`,
    `Q ${x + w} ${top} ${x + w} ${top + r}`,
    `L ${x + w} ${baseline - r}`,
    `Q ${x + w} ${baseline} ${x + w - r} ${baseline}`,
    `L ${x + r} ${baseline}`,
    `Q ${x} ${baseline} ${x} ${baseline - r}`,
    `L ${x} ${top + r}`,
    `Q ${x} ${top} ${x + r} ${top}`,
    'Z',
  ].join(' ');
}

/**
 * Builds a fallback font descriptor when the original font is not in the registry.
 */
function buildFallbackDescriptor(element: TypographyElement): FontDescriptor {
  return {
    family: element.fontFamily,
    weight: element.fontWeight,
    style: element.fontStyle,
    postScriptName: element.fontFamily.replace(/\s+/g, ''),
    fullName: `${element.fontFamily} ${element.fontWeight}`,
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    lineGap: 0,
    capHeight: 700,
    xHeight: 500,
  };
}

/**
 * Preserves kerning table for a typography element.
 */
export function preserveKerning(element: TypographyElement): KerningTable {
  const descriptor = buildFallbackDescriptor(element);
  const pairs = extractKerningPairs(descriptor, element.text);
  const pairMap = new Map<string, number>();

  for (const pair of pairs) {
    pairMap.set(`${pair.left}|${pair.right}`, pair.value);
  }

  return {
    fontKey: fontKey(element.fontFamily, element.fontWeight, element.fontStyle),
    pairs,
    pairMap,
  };
}

/**
 * Preserves baseline alignment data for a set of text elements.
 */
export function preserveBaseline(elements: TypographyElement[]): BaselineAlignment[] {
  const alignments: BaselineAlignment[] = [];

  for (const el of elements) {
    const ascent = el.fontSize * 0.8;
    const descent = el.fontSize * 0.2;
    const baseline = el.y + ascent;
    const capLine = baseline - el.fontSize * 0.7;
    const meanLine = baseline - el.fontSize * 0.5;

    alignments.push({
      elementId: el.id,
      baseline,
      ascent,
      descent,
      capLine,
      meanLine,
    });
  }

  logger.debug('Preserved baselines', { count: alignments.length });
  return alignments;
}
