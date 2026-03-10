import { createHash } from 'crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import {
  executeReportTool,
  getArtifact,
  getEvidence,
  getReport,
  getTemplate,
  listReportTools,
  resetReportUltraEngine,
} from '../../services/report-ultra-engine.service';

const context = {
  workspace_id: 'workspace-1',
  user_id: 'user-1',
  mode: 'AUTO' as const,
  arabic_mode: 'ELITE' as const,
  locale: 'ar-SA',
};

function makeAsset(assetId: string, filePath: string, mime: string) {
  const buffer = readFileSync(filePath);
  return {
    asset_id: assetId,
    uri: filePath,
    mime,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

async function createTemplateDocx(filePath: string): Promise<void> {
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Executive Template', heading: HeadingLevel.TITLE }),
        new Paragraph({ text: 'Heading Sample', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Body paragraph sample.'),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(document);
  writeFileSync(filePath, buffer);
}

describe('report ultra engine service', () => {
  beforeEach(() => {
    resetReportUltraEngine();
  });

  it('executes the report engine end-to-end with exports, parity, governance, and evidence', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'rasid-report-ultra-'));
    const csvPath = join(tempDir, 'sales.csv');
    const templatePath = join(tempDir, 'template.docx');
    writeFileSync(
      csvPath,
      'month,region,revenue,orders\n2026-01,Riyadh,1200,12\n2026-02,Jeddah,1600,16\n2026-03,Dammam,1420,14\n',
      'utf8',
    );
    await createTemplateDocx(templatePath);

    const intent = await executeReportTool({
      request_id: 'report-1',
      tool_id: 'report.intent_parse',
      context,
      inputs: {
        prompt: 'أنشئ تقريرًا تنفيذيًا عن أداء المبيعات مع توصيات وملاحق بيانات',
        assets: [makeAsset('asset_csv', csvPath, 'text/csv')],
      },
      params: {
        fidelity_mode: 'smart',
        classification: 'confidential',
        detail_level: 'deep',
        tone: 'formal',
      },
    });
    const intentRef = intent.refs.intent as { dataset_refs: Array<{ dataset_id: string }>; language: string };
    expect(intentRef.dataset_refs).toHaveLength(1);
    expect(intentRef.language).toBe('ar');

    const template = await executeReportTool({
      request_id: 'report-2',
      tool_id: 'report.template_extract',
      context,
      inputs: {
        template_docx: makeAsset('asset_template', templatePath, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      },
      params: {},
    });
    const templateId = template.refs.template_id as string;
    expect(getTemplate(templateId)).toBeTruthy();

    const outline = await executeReportTool({
      request_id: 'report-3',
      tool_id: 'report.plan_outline',
      context,
      inputs: { intent: intent.refs.intent as any },
      params: {},
    });

    const build = await executeReportTool({
      request_id: 'report-4',
      tool_id: 'report.build_doc_ir',
      context,
      inputs: {
        outline: outline.refs.outline as any,
        template_id: templateId,
      },
      params: {},
    });
    const docRef = build.refs.doc as { doc_id: string; version: number };

    const bind = await executeReportTool({
      request_id: 'report-5',
      tool_id: 'report.bind_data',
      context,
      inputs: {
        doc: docRef,
        datasets: intentRef.dataset_refs,
        tir_steps: [{ op: 'derive', column: 'revenue_with_tax', source: 'revenue', multiplier: 1.15 }],
        mir_measures: [{ name: 'إجمالي الإيراد', op: 'sum', column: 'revenue' }],
      },
      params: {},
    });
    expect((bind.refs.doc as { doc_id: string }).doc_id).toBe(docRef.doc_id);

    const smart = await executeReportTool({
      request_id: 'report-6',
      tool_id: 'report.generate_content_smart',
      context,
      inputs: {
        doc: bind.refs.doc as any,
        prompt: 'ركز على الملخص التنفيذي ثم النتائج ثم التوصيات',
      },
      params: {},
    });
    expect((smart.refs.content_trace as { blocks: Array<Record<string, unknown>> }).blocks.length).toBeGreaterThan(0);

    const report = getReport(docRef.doc_id)!;
    report.doc_ir.sections[0].blocks = [];

    const qaFail = await executeReportTool({
      request_id: 'report-7',
      tool_id: 'report.qa_validate',
      context,
      inputs: { doc: smart.refs.doc as any },
      params: { must_pass_all: true },
    });
    expect(qaFail.refs.pass).toBe(false);

    const qaFix = await executeReportTool({
      request_id: 'report-8',
      tool_id: 'report.qa_autofix',
      context,
      inputs: {
        doc: smart.refs.doc as any,
        issues: qaFail.refs.issues as any,
      },
      params: {},
    });
    expect((qaFix.refs.fix_log as Array<Record<string, unknown>>).length).toBeGreaterThan(0);

    const qaPass = await executeReportTool({
      request_id: 'report-9',
      tool_id: 'report.qa_validate',
      context,
      inputs: { doc: qaFix.refs.doc as any },
      params: { must_pass_all: true },
    });
    expect(qaPass.refs.pass).toBe(true);

    const docxExport = await executeReportTool({
      request_id: 'report-10',
      tool_id: 'report.export_docx',
      context,
      inputs: { doc: qaFix.refs.doc as any },
      params: { embed_fonts: true },
    });
    const pdfExport = await executeReportTool({
      request_id: 'report-11',
      tool_id: 'report.export_pdf',
      context,
      inputs: { doc: qaFix.refs.doc as any },
      params: {},
    });
    const htmlExport = await executeReportTool({
      request_id: 'report-12',
      tool_id: 'report.export_html',
      context,
      inputs: { doc: qaFix.refs.doc as any },
      params: {},
    });
    const pptxExport = await executeReportTool({
      request_id: 'report-13',
      tool_id: 'report.export_pptx',
      context,
      inputs: { doc: qaFix.refs.doc as any },
      params: {},
    });
    const xlsxExport = await executeReportTool({
      request_id: 'report-14',
      tool_id: 'report.export_xlsx',
      context,
      inputs: { doc: qaFix.refs.doc as any },
      params: {},
    });
    const artifacts = [
      docxExport.refs.artifact as { artifact_id: string; uri: string },
      pdfExport.refs.artifact as { artifact_id: string; uri: string },
      htmlExport.refs.artifact as { artifact_id: string; uri: string },
      pptxExport.refs.artifact as { artifact_id: string; uri: string },
      xlsxExport.refs.artifact as { artifact_id: string; uri: string },
    ];
    artifacts.forEach(artifact => expect(existsSync(artifact.uri)).toBe(true));

    const parity = await executeReportTool({
      request_id: 'report-15',
      tool_id: 'report.render_parity_verify',
      context,
      inputs: {
        doc: qaFix.refs.doc as any,
        artifacts: [
          docxExport.refs.artifact as any,
          pdfExport.refs.artifact as any,
          htmlExport.refs.artifact as any,
          pptxExport.refs.artifact as any,
          xlsxExport.refs.artifact as any,
        ],
      },
      params: {},
    });
    expect(parity.refs.pass).toBe(true);

    const governance = await executeReportTool({
      request_id: 'report-16',
      tool_id: 'report.classify_and_govern',
      context,
      inputs: {
        doc: qaFix.refs.doc as any,
        permissions: { view: ['executives'], edit: ['user-1'] },
        share_policy: { export: true, external_share: false },
      },
      params: {
        classification: 'confidential',
        approvals_enabled: true,
      },
    });
    expect((governance.refs.governance as { state: string }).state).toBe('review');

    const evidence = await executeReportTool({
      request_id: 'report-17',
      tool_id: 'report.evidence_pack',
      context,
      inputs: {
        doc: qaFix.refs.doc as any,
        artifacts: [
          docxExport.refs.artifact as any,
          pdfExport.refs.artifact as any,
          htmlExport.refs.artifact as any,
          pptxExport.refs.artifact as any,
          xlsxExport.refs.artifact as any,
        ],
        qa_report: qaPass.refs as any,
        parity_report: parity.refs as any,
        template_compliance: getReport(docRef.doc_id)?.template_compliance as any,
        content_trace: smart.refs.content_trace as any,
      },
      params: {},
    });

    const evidenceId = evidence.refs.evidence_id as string;
    expect(getEvidence(evidenceId)?.artifact_ids.length).toBe(5);
    expect(getArtifact((htmlExport.refs.artifact as any).artifact_id)?.render_manifest_uri).toBeTruthy();
    expect(listReportTools()).toHaveLength(17);
  });

  it('preserves literal text 1:1 through DOCX extraction hashing', async () => {
    const intent = await executeReportTool({
      request_id: 'literal-1',
      tool_id: 'report.intent_parse',
      context,
      inputs: {
        prompt: 'تقرير حرفي',
      },
      params: {
        fidelity_mode: 'literal_1to1',
        classification: 'internal',
        detail_level: 'brief',
        tone: 'formal',
      },
    });

    const outline = await executeReportTool({
      request_id: 'literal-2',
      tool_id: 'report.plan_outline',
      context,
      inputs: { intent: intent.refs.intent as any },
      params: {},
    });

    const build = await executeReportTool({
      request_id: 'literal-3',
      tool_id: 'report.build_doc_ir',
      context,
      inputs: { outline: outline.refs.outline as any },
      params: {},
    });

    const literalText = 'الفقرة الأولى كما هي.\n\nالفقرة الثانية دون أي تعديل.\nسطر ثالث.';
    const literal = await executeReportTool({
      request_id: 'literal-4',
      tool_id: 'report.generate_content_literal',
      context,
      inputs: {
        doc: build.refs.doc as any,
        user_text: literalText,
      },
      params: {},
    });

    const hashReport = literal.refs.literal_hash_report as { literal_hash_in: string; literal_hash_out: string };
    expect(hashReport.literal_hash_in).toBe(hashReport.literal_hash_out);

    const docxExport = await executeReportTool({
      request_id: 'literal-5',
      tool_id: 'report.export_docx',
      context,
      inputs: { doc: literal.refs.doc as any },
      params: { embed_fonts: true },
    });
    expect(existsSync((docxExport.refs.artifact as { uri: string }).uri)).toBe(true);
  });
});
