import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initStrictEngine, runStrictPipeline } from '../strict/index';
import { EvidencePackBuilder } from '../strict/evidence/evidence-pack';
import type { ActionContext, AssetRef } from '../strict/cdr/types';

describe('STRICT pipeline', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'rasid-strict-pipeline-'));

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('produces a passing artifact and complete evidence pack for a minimal PDF', async () => {
    initStrictEngine();

    const pdfPath = join(tempDir, 'minimal.pdf');
    writeFileSync(
      pdfPath,
      `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF`,
      'utf8',
    );

    const context: ActionContext = {
      workspace_id: 'workspace-1',
      user_id: 'user-1',
      locale: 'ar-SA',
      strict_visual: true,
      arabic_mode: 'ELITE',
      mode: 'AUTO',
      font_policy: 'PROVIDED',
    };

    const asset: AssetRef = {
      asset_id: 'asset-0001',
      uri: pdfPath,
      mime: 'application/pdf',
      sha256: 'a'.repeat(64),
      size_bytes: 256,
      page_count: 1,
    };

    const result = await runStrictPipeline(context, asset, 'pptx');

    if (!result.success) {
      throw new Error(result.error ?? 'STRICT pipeline failed without an error message');
    }

    expect(result.success).toBe(true);
    expect(result.artifact).toEqual(
      expect.objectContaining({
        artifact_id: expect.any(String),
        kind: 'pptx',
      }),
    );
    expect(result.evidence_pack).toBeDefined();
    expect(result.evidence_pack?.pixel_diff_reports.every(diff => diff.pass)).toBe(true);
    expect(result.evidence_pack?.structural_hashes).toHaveLength(1);
    expect(result.evidence_pack?.action_graph_snapshot).toContain('verify_pixel');
    expect(EvidencePackBuilder.validate(result.evidence_pack!)).toEqual({
      valid: true,
      errors: [],
    });
  }, 20000);
});
