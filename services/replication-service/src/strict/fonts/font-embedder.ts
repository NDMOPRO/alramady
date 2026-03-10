/**
 * Font Embedding — Section 6.5.1 Font Fallback Prohibition + B6
 *
 * STRICT: MUST NOT substitute to a "similar" font.
 * If exact font not found:
 *   - For PDF: MUST extract embedded font program & embed it
 *   - For Image: MUST reconstruct glyph outlines into embedded font subset (FontSynth)
 * If FontSynth cannot produce PixelDiff==0 => FAIL STRICT
 */

import { randomUUID } from 'crypto';
import type {
  FontPlan,
  FontPlanEntry,
  FontStatus,
  Warning,
} from '../cdr/types';
import type { ToolRequest, ToolResponse } from '../tools/registry';

// ─── Font Vault ──────────────────────────────────────────────────────
export interface FontVaultEntry {
  family: string;
  variants: FontVariant[];
}

export interface FontVariant {
  weight: number;
  style: 'normal' | 'italic' | 'oblique';
  format: 'truetype' | 'opentype' | 'woff2' | 'embedded';
  uri: string;
  glyph_count: number;
  sha256: string;
}

// ─── Font Vault (in-memory) ─────────────────────────────────────────
const fontVault = new Map<string, FontVaultEntry>();

export function registerFont(entry: FontVaultEntry): void {
  fontVault.set(entry.family.toLowerCase(), entry);
}

export function lookupFont(family: string): FontVaultEntry | undefined {
  return fontVault.get(family.toLowerCase());
}

// ─── Font Plan Resolution ────────────────────────────────────────────
export function resolveFontPlan(plan: FontPlan): { resolved: FontPlan; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const resolvedFonts: FontPlanEntry[] = [];

  for (const font of plan.fonts) {
    const vaultEntry = lookupFont(font.family);

    if (vaultEntry && vaultEntry.variants.length > 0) {
      resolvedFonts.push({
        family: font.family,
        status: 'available',
        font_program_uri: vaultEntry.variants[0].uri,
        embed_all_glyphs: true,
      });
    } else if (font.font_program_uri) {
      // Font has embedded program (extracted from PDF)
      resolvedFonts.push({
        family: font.family,
        status: 'embedded',
        font_program_uri: font.font_program_uri,
        embed_all_glyphs: true,
      });
    } else {
      // STRICT: Cannot substitute — mark as missing
      // Caller MUST handle this as FAIL
      resolvedFonts.push({
        family: font.family,
        status: 'missing',
        embed_all_glyphs: true,
      });
      warnings.push({
        code: 'FONT_MISSING_STRICT',
        message: `Font "${font.family}" not found in vault and has no embedded program. STRICT mode prohibits font substitution.`,
        severity: 'error',
      });
    }
  }

  return {
    resolved: { fonts: resolvedFonts },
    warnings,
  };
}

// ─── FontSynth — Glyph Outline Reconstruction ───────────────────────
export interface FontSynthConfig {
  /** Source glyph images (rendered text at known size) */
  glyph_images: Map<string, Buffer>;
  /** Target font family name */
  family: string;
  /** Target metrics */
  ascent: number;
  descent: number;
  units_per_em: number;
}

/**
 * Reconstruct font glyph outlines from rendered images.
 * Used when converting from image input where no font program exists.
 *
 * Returns a font program URI (synthesized font file).
 */
export async function synthesizeFont(config: FontSynthConfig): Promise<string> {
  // In production: use fontkit/opentype.js to create font from glyph outlines
  // Each glyph is traced from its rendered image using potrace/autotrace
  const synthId = randomUUID();
  const uri = `/fonts/synth/${synthId}.otf`;

  // Register synthesized font in vault
  registerFont({
    family: config.family,
    variants: [{
      weight: 400,
      style: 'normal',
      format: 'opentype',
      uri,
      glyph_count: config.glyph_images.size,
      sha256: synthId,
    }],
  });

  return uri;
}

// ─── Tool Handler (B6) ───────────────────────────────────────────────
export async function handleFontEmbedFullGlyph(
  request: ToolRequest<{ font_plan: FontPlan }, { embed_all_glyphs: true }>
): Promise<ToolResponse<{ font_plan: FontPlan }>> {
  const { font_plan } = request.inputs;

  const { resolved, warnings } = resolveFontPlan(font_plan);

  // Check for any missing fonts — STRICT mode
  const hasMissing = resolved.fonts.some(f => f.status === 'missing');

  return {
    request_id: request.request_id,
    tool_id: 'fonts.embed_full_glyph',
    status: hasMissing ? 'failed' : 'ok',
    refs: { font_plan: resolved },
    warnings,
  };
}
