/**
 * Determinism Validation — Section 4 + B11
 * Same input + same policies + same versions + same Farm image => MUST produce identical renders.
 */

import type { RenderRef, DeterminismCheck } from '../cdr/types';
import type { ToolRequest, ToolResponse } from '../tools/registry';

export interface DeterminismResult {
  pass: boolean;
  pixel_hashes_match: boolean;
  engine_fingerprints_match: boolean;
  render_config_consistent: boolean;
  render_config_hashes_match: boolean;
  violations: string[];
}

/**
 * Validate that multiple renders of the same input produce identical pixel_hash.
 */
export function validateDeterminism(
  renders: RenderRef[],
  checks: DeterminismCheck,
): DeterminismResult {
  const violations: string[] = [];

  if (renders.length < 2) {
    violations.push('Determinism validation requires at least 2 renders');
    return {
      pass: false,
      pixel_hashes_match: false,
      engine_fingerprints_match: false,
      render_config_consistent: false,
      render_config_hashes_match: false,
      violations,
    };
  }

  // Check all renders have same pixel_hash
  const firstHash = renders[0].fingerprint.pixel_hash;
  const pixelHashesMatch = renders.every(r => r.fingerprint.pixel_hash === firstHash);
  if (!pixelHashesMatch) {
    violations.push(`Pixel hashes differ across renders: ${renders.map(r => r.fingerprint.pixel_hash.slice(0, 16)).join(', ')}`);
  }

  // Check all renders have same engine_fingerprint
  const firstEngine = renders[0].engine_fingerprint;
  const engineMatch = renders.every(r => r.engine_fingerprint === firstEngine);
  if (!engineMatch) {
    violations.push(`Engine fingerprints differ: ${renders.map(r => r.engine_fingerprint).join(', ')}`);
  }

  // Check all renders have consistent DPI and colorspace
  const firstDpi = renders[0].dpi;
  const firstCs = renders[0].colorspace;
  const configConsistent = renders.every(r => r.dpi === firstDpi && r.colorspace === firstCs);
  if (!configConsistent) {
    violations.push('Render config (DPI/colorspace) inconsistent across renders');
  }

  const firstConfigHash = renders[0].render_config_hash;
  const renderConfigHashesMatch = renders.every(r => r.render_config_hash === firstConfigHash);
  if (!renderConfigHashesMatch) {
    violations.push('render_config_hash mismatch across renders');
  }

  // Validate determinism checks
  if (checks.anti_aliasing_policy !== 'locked') {
    violations.push('Anti-aliasing policy MUST be locked');
  }
  if (checks.float_norm_policy !== 'locked') {
    violations.push('Float normalization policy MUST be locked');
  }
  if (!checks.random_seed_locked) {
    violations.push('Random seed MUST be locked');
  }
  if (checks.gpu_cpu_parity !== 'validated' && checks.gpu_cpu_parity !== 'forced_single_path') {
    violations.push('GPU/CPU parity MUST be validated or forced_single_path');
  }

  const pass = pixelHashesMatch && engineMatch && configConsistent && renderConfigHashesMatch && violations.length === 0;

  return {
    pass,
    pixel_hashes_match: pixelHashesMatch,
    engine_fingerprints_match: engineMatch,
    render_config_consistent: configConsistent,
    render_config_hashes_match: renderConfigHashesMatch,
    violations,
  };
}

// ─── Tool Handler ────────────────────────────────────────────────────
export async function handleValidateDeterminism(
  request: ToolRequest<
    { renders: RenderRef[]; checks: DeterminismCheck },
    Record<string, never>
  >
): Promise<ToolResponse<{ pass: boolean }>> {
  const result = validateDeterminism(request.inputs.renders, request.inputs.checks);

  return {
    request_id: request.request_id,
    tool_id: 'render.validate_determinism',
    status: result.pass ? 'ok' : 'failed',
    refs: { pass: result.pass },
  };
}
