import { describe, expect, it } from '@jest/globals';
import { existsSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  applyLiteralMode,
  applyTheme,
  autofixQa,
  type DeckRef,
  buildDeck,
  buildEvidencePack,
  buildIntentManifest,
  buildLiteralHashReport,
  executeSlidesTool,
  exportDeckToPptx,
  generateOutline,
  generateStoryboard,
  getArtifact,
  getEvidencePack,
  validateQa,
  verifyRenderParity,
} from '../../services/gamma-engine.service';

const context = {
  workspace_id: 'workspace-1',
  user_id: 'user-1',
  locale: 'ar-SA',
  mode: 'AUTO' as const,
  arabic_mode: 'ELITE' as const,
  brand_kit_id: 'brand-main',
};

describe('gamma engine service', () => {
  it('builds a complete intent manifest with literal precedence and defaults', () => {
    const manifest = buildIntentManifest('أنشئ عرضًا حرفيًا عن خطة المشروع', {
      mode: 'smart',
      template_id: 'template-1',
      assets: [{
        asset_id: 'asset-a',
        uri: '/tmp/a.png',
        mime: 'image/png',
        sha256: 'a'.repeat(64),
      }],
      brand_kit_id: 'brand-main',
    });

    expect(manifest.content_fidelity_mode).toBe('literal');
    expect(manifest.slide_count).toBe(10);
    expect(manifest.template_id).toBe('template-1');
    expect(manifest.data_sources).toEqual(['asset-a']);
    expect(manifest.language).toBe('ar');
  });

  it('preserves literal text 1:1 across deck application and hash extraction', () => {
    const manifest = buildIntentManifest('Literal source prompt', { mode: 'literal', brand_kit_id: 'brand-main' });
    const outline = generateOutline(manifest);
    const storyboard = generateStoryboard(outline);
    const deck = buildDeck(storyboard, applyTheme('theme-alpha', 'brand-main'), [], 'literal');
    const userText = 'Line one.\n\nLine two stays exact.\nBullet A\nBullet B';
    const literal = applyLiteralMode(userText, deck.deck_id);

    expect(literal.literal_hash_report.pass).toBe(true);
    expect(buildLiteralHashReport(userText, literal.deck.slides.map(slide => slide.body_text)).pass).toBe(true);
  });

  it('autofixes overflow, exports pptx, and builds evidence', async () => {
    const manifest = buildIntentManifest('Project report', { mode: 'smart', brand_kit_id: 'brand-main' });
    const outline = generateOutline(manifest);
    const storyboard = generateStoryboard(outline);
    storyboard.slides = [{
      ...storyboard.slides[0],
      content_spec: {
        ...storyboard.slides[0].content_spec,
        body: 'Long text '.repeat(200),
      },
      min_font_size: 12,
    }];

    const deck = buildDeck(storyboard, applyTheme('theme-alpha', 'brand-main'));
    expect(validateQa(deck.deck_id).pass).toBe(false);

    const fixed = autofixQa(deck.deck_id);
    const qa = validateQa(fixed.deck.deck_id);
    const exported = await exportDeckToPptx(fixed.deck.deck_id);
    const parity = verifyRenderParity(fixed.deck.deck_id, exported.artifact.artifact_id);
    const evidence = buildEvidencePack({
      deck: fixed.deck.deck_id,
      pptx: exported.artifact.artifact_id,
      qa_report: qa,
    });

    expect(qa.pass).toBe(true);
    expect(exported.size_bytes).toBeGreaterThan(0);
    expect(evidence.deck_id).toBe(fixed.deck.deck_id);
    expect(parity.pass).toBe(true);
    expect(getArtifact(exported.artifact.artifact_id)?.artifact.uri).toBe(exported.artifact.uri);
    expect(getEvidencePack(evidence.evidence_id)?.artifact_id).toBe(exported.artifact.artifact_id);
  });

  it('rejects malformed tool requests by contract', async () => {
    await expect(executeSlidesTool({
      request_id: 'req-bad',
      tool_id: 'slides.export_pptx',
      context,
      inputs: {},
      params: { embed_fonts: true },
    })).rejects.toThrow('deck');
  });

  it('executes exact slides tools end-to-end', async () => {
    const intentResponse = await executeSlidesTool({
      request_id: 'req-1',
      tool_id: 'slides.intent_parse',
      context,
      inputs: { prompt: '10 شرائح عن التقرير الربعي', assets: [] },
      params: {},
    });
    const outlineResponse = await executeSlidesTool({
      request_id: 'req-2',
      tool_id: 'slides.plan_outline',
      context,
      inputs: { intent: intentResponse.refs.intent },
      params: {},
    });
    const storyboardResponse = await executeSlidesTool({
      request_id: 'req-3',
      tool_id: 'slides.plan_storyboard',
      context,
      inputs: { outline: outlineResponse.refs.outline },
      params: {},
    });
    const themeResponse = await executeSlidesTool({
      request_id: 'req-4',
      tool_id: 'slides.apply_theme',
      context,
      inputs: { theme_id: 'theme-alpha', brand_kit_id: context.brand_kit_id },
      params: { force_fonts: true, force_palette: true, logo_rules: 'auto' },
    });
    const deckResponse = await executeSlidesTool({
      request_id: 'req-5',
      tool_id: 'slides.build_deck',
      context,
      inputs: { storyboard: storyboardResponse.refs.storyboard, theme_tokens: themeResponse.refs.theme_tokens, assets: [] },
      params: { grid_profile: 'premium_16_9', rtl_policy: 'auto' },
    });
    const strictInsertResponse = await executeSlidesTool({
      request_id: 'req-5b',
      tool_id: 'slides.insert_strict_slide_from_asset',
      context,
      inputs: {
        deck: deckResponse.refs.deck,
        asset: {
          asset_id: 'asset-strict',
          uri: 'C:\\DATA_AI\\rasid\\README.md',
          mime: 'application/pdf',
          sha256: 'b'.repeat(64),
        },
        target_index: 1,
      },
      params: { strict_mode: 'STRICT_1TO1_100', page_number: 1 },
    });
    const qaResponse = await executeSlidesTool({
      request_id: 'req-6',
      tool_id: 'slides.qa_validate',
      context,
      inputs: { deck: strictInsertResponse.refs.deck },
      params: { must_pass_all: true },
    });
    const exportResponse = await executeSlidesTool({
      request_id: 'req-7',
      tool_id: 'slides.export_pptx',
      context,
      inputs: { deck: strictInsertResponse.refs.deck },
      params: { embed_fonts: true },
    });
    const parityResponse = await executeSlidesTool({
      request_id: 'req-8',
      tool_id: 'slides.render_parity_verify',
      context,
      inputs: { deck: strictInsertResponse.refs.deck, pptx: exportResponse.refs.pptx },
      params: {},
    });
    const evidenceResponse = await executeSlidesTool({
      request_id: 'req-9',
      tool_id: 'slides.evidence_pack',
      context,
      inputs: { deck: strictInsertResponse.refs.deck, pptx: exportResponse.refs.pptx, qa_report: qaResponse.refs },
      params: {},
    });
    const initialDeckRef = deckResponse.refs.deck as DeckRef;
    const strictDeckRef = strictInsertResponse.refs.deck as DeckRef;

    expect(intentResponse.status).toBe('ok');
    expect(strictDeckRef.slide_count).toBe(initialDeckRef.slide_count + 1);
    expect(qaResponse.refs.pass).toBe(true);
    expect(parityResponse.refs.pass).toBe(true);
    expect(evidenceResponse.refs.evidence_id).toBeTruthy();
  });

  it('supports infinite control, catalogs, data, media, preview, and export matrix tools', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'rasid-gamma-'));
    const csvPath = join(tempDir, 'sales.csv');
    writeFileSync(csvPath, 'Quarter,Sales,Region\nQ1,120,East\nQ2,150,West\nQ3,180,North\nQ4,210,South\n', 'utf8');

    const intentResponse = await executeSlidesTool({
      request_id: 'ctl-1',
      tool_id: 'slides.intent_parse',
      context,
      inputs: { prompt: 'عرض تنفيذي 6 شرائح عن نتائج المبيعات مع KPI ومقارنة', assets: [] },
      params: {},
    });
    const controlResponse = await executeSlidesTool({
      request_id: 'ctl-2',
      tool_id: 'slides.control_manifest_build',
      context,
      inputs: { intent: intentResponse.refs.intent },
      params: {},
    });
    const prefsSetResponse = await executeSlidesTool({
      request_id: 'ctl-3',
      tool_id: 'slides.preferences_set',
      context,
      inputs: { preferences: { default_motion_level: 'basic', default_export_targets: ['pptx', 'pdf', 'html'] } },
      params: {},
    });
    const prefsGetResponse = await executeSlidesTool({
      request_id: 'ctl-4',
      tool_id: 'slides.preferences_get',
      context,
      inputs: {},
      params: {},
    });
    const catalogResponse = await executeSlidesTool({
      request_id: 'ctl-5',
      tool_id: 'slides.catalog_search',
      context,
      inputs: { catalog: 'layout', top_k: 12, rtl_ready: true },
      params: {},
    });
    const variantResponse = await executeSlidesTool({
      request_id: 'ctl-6',
      tool_id: 'slides.variant_generate',
      context,
      inputs: {
        catalog: 'layout',
        base_item_id: (catalogResponse.refs.items as Array<{ item_id: string }>)[0].item_id,
        direction: 'more_like_this',
        count: 12,
      },
      params: {},
    });
    const outlineResponse = await executeSlidesTool({
      request_id: 'ctl-7',
      tool_id: 'slides.plan_outline',
      context,
      inputs: { intent: intentResponse.refs.intent },
      params: {},
    });
    const storyboardResponse = await executeSlidesTool({
      request_id: 'ctl-8',
      tool_id: 'slides.plan_storyboard',
      context,
      inputs: { outline: outlineResponse.refs.outline },
      params: {},
    });
    const themeResponse = await executeSlidesTool({
      request_id: 'ctl-9',
      tool_id: 'slides.apply_theme',
      context,
      inputs: { theme_id: 'theme-exec', brand_kit_id: context.brand_kit_id },
      params: { force_fonts: true, force_palette: true, logo_rules: 'auto' },
    });
    const deckResponse = await executeSlidesTool({
      request_id: 'ctl-10',
      tool_id: 'slides.build_deck',
      context,
      inputs: { storyboard: storyboardResponse.refs.storyboard, theme_tokens: themeResponse.refs.theme_tokens, assets: [] },
      params: { grid_profile: 'premium_16_9', rtl_policy: 'auto' },
    });
    const transformResponse = await executeSlidesTool({
      request_id: 'ctl-11',
      tool_id: 'slides.element_transform',
      context,
      inputs: {
        deck: deckResponse.refs.deck,
        slide_index: 1,
        element_id: 'layout',
        catalog: 'layout',
        variant_id: (variantResponse.refs.variants as Array<{ item_id: string }>)[0].item_id,
      },
      params: {},
    });
    const dataPickerResponse = await executeSlidesTool({
      request_id: 'ctl-12',
      tool_id: 'slides.data_picker_browse',
      context,
      inputs: {
        asset: {
          asset_id: 'csv-sales',
          uri: csvPath,
          mime: 'text/csv',
          sha256: 'c'.repeat(64),
        },
        columns: ['Quarter', 'Sales'],
      },
      params: {},
    });
    const dataBindingResponse = await executeSlidesTool({
      request_id: 'ctl-13',
      tool_id: 'slides.data_binding_apply',
      context,
      inputs: {
        deck: transformResponse.refs.deck,
        slide_index: 1,
        binding: dataPickerResponse.refs.binding,
        binding_kind: 'chart',
      },
      params: {},
    });
    const mediaImportResponse = await executeSlidesTool({
      request_id: 'ctl-14',
      tool_id: 'slides.media_import',
      context,
      inputs: {
        source_type: 'local',
        uri: csvPath,
        mime: 'text/csv',
      },
      params: {},
    });
    const videoResponse = await executeSlidesTool({
      request_id: 'ctl-15',
      tool_id: 'slides.video_embed',
      context,
      inputs: {
        deck: dataBindingResponse.refs.deck,
        slide_index: 1,
        url: 'https://example.com/video.mp4',
        autoplay: false,
        start_time: 5,
      },
      params: {},
    });
    const previewResponse = await executeSlidesTool({
      request_id: 'ctl-16',
      tool_id: 'slides.preview_render',
      context,
      inputs: { deck: videoResponse.refs.deck },
      params: {},
    });
    const readerResponse = await executeSlidesTool({
      request_id: 'ctl-17',
      tool_id: 'slides.reader_launch',
      context,
      inputs: { deck: videoResponse.refs.deck },
      params: {},
    });
    const pptxResponse = await executeSlidesTool({
      request_id: 'ctl-18',
      tool_id: 'slides.export_pptx',
      context,
      inputs: { deck: videoResponse.refs.deck },
      params: { embed_fonts: true },
    });
    const pdfResponse = await executeSlidesTool({
      request_id: 'ctl-19',
      tool_id: 'slides.export_pdf',
      context,
      inputs: { deck: videoResponse.refs.deck },
      params: {},
    });
    const htmlResponse = await executeSlidesTool({
      request_id: 'ctl-20',
      tool_id: 'slides.export_html',
      context,
      inputs: { deck: videoResponse.refs.deck },
      params: {},
    });
    const googleResponse = await executeSlidesTool({
      request_id: 'ctl-21',
      tool_id: 'slides.export_google_slides',
      context,
      inputs: { deck: videoResponse.refs.deck },
      params: {},
    });
    const parityMatrixResponse = await executeSlidesTool({
      request_id: 'ctl-22',
      tool_id: 'slides.parity_matrix_verify',
      context,
      inputs: {
        deck: videoResponse.refs.deck,
        artifacts: [pptxResponse.refs.pptx, pdfResponse.refs.artifact, htmlResponse.refs.artifact, googleResponse.refs.artifact],
        preview_id: previewResponse.refs.preview_id,
      },
      params: {},
    });
    const evidenceExportResponse = await executeSlidesTool({
      request_id: 'ctl-23',
      tool_id: 'slides.evidence_pack_export',
      context,
      inputs: {
        deck: videoResponse.refs.deck,
        artifacts: [pptxResponse.refs.pptx, pdfResponse.refs.artifact, htmlResponse.refs.artifact, googleResponse.refs.artifact],
        qa_report: { pass: true, issues: [], fix_log: [] },
        preview_id: previewResponse.refs.preview_id,
      },
      params: {},
    });
    const controlManifest = controlResponse.refs.control_manifest as { prefs_enabled: boolean };
    const prefsSet = prefsSetResponse.refs.preferences as { default_motion_level: string };
    const prefsGet = prefsGetResponse.refs.preferences as { default_export_targets: string[] };
    const binding = dataPickerResponse.refs.binding as { rows_preview: unknown[] };
    const previewFrames = previewResponse.refs.frames as unknown[];

    expect(controlManifest.prefs_enabled).toBe(true);
    expect(prefsSet.default_motion_level).toBe('basic');
    expect(prefsGet.default_export_targets).toContain('html');
    expect(catalogResponse.refs.total_available).toBeGreaterThanOrEqual(300);
    expect(variantResponse.refs.variants).toHaveLength(12);
    expect(binding.rows_preview).toHaveLength(4);
    expect(mediaImportResponse.refs.cached).toBe(true);
    expect(previewFrames.length).toBeGreaterThan(0);
    expect(existsSync(readerResponse.refs.reader_url as string)).toBe(true);
    expect(parityMatrixResponse.refs.pass).toBe(true);
    expect(evidenceExportResponse.refs.evidence_id).toBeTruthy();
  });
});
