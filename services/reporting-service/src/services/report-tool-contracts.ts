import { z } from 'zod';

const actionContextSchema = z.object({
  workspace_id: z.string(),
  user_id: z.string(),
  mode: z.enum(['AUTO', 'CONTROLLED']),
  arabic_mode: z.enum(['BASIC', 'PROFESSIONAL', 'ELITE']),
  locale: z.string(),
}).passthrough();

const assetRefSchema = z.object({
  asset_id: z.string(),
  uri: z.string(),
  mime: z.string(),
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
}).strict();

const datasetRefSchema = z.object({
  dataset_id: z.string(),
}).strict();

const docRefSchema = z.object({
  doc_id: z.string(),
  version: z.number().int().min(1),
}).strict();

const artifactRefSchema = z.object({
  artifact_id: z.string(),
  kind: z.enum(['docx', 'pdf', 'html', 'pptx', 'xlsx', 'png', 'json']),
  uri: z.string(),
}).strict();

const warningsSchema = z.array(z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
}).strict()).default([]);

function toolRequestSchema<TInputs extends z.ZodTypeAny, TParams extends z.ZodTypeAny>(
  toolId: string,
  inputs: TInputs,
  params: TParams,
) {
  return z.object({
    request_id: z.string(),
    tool_id: z.literal(toolId),
    context: actionContextSchema,
    inputs,
    params,
  }).strict();
}

function toolResponseSchema<TRefs extends z.ZodTypeAny>(
  toolId: string,
  refs: TRefs,
) {
  return z.object({
    request_id: z.string(),
    tool_id: z.literal(toolId),
    status: z.enum(['ok', 'failed']),
    refs,
    warnings: warningsSchema.optional(),
    failure: z.object({
      code: z.string(),
      message: z.string(),
    }).optional(),
  }).strict();
}

const requestSchemas = new Map<string, z.ZodTypeAny>([
  ['report.intent_parse', toolRequestSchema(
    'report.intent_parse',
    z.object({
      prompt: z.string().min(1),
      assets: z.array(assetRefSchema).optional(),
      datasets: z.array(datasetRefSchema).optional(),
    }).strict(),
    z.object({
      fidelity_mode: z.enum(['literal_1to1', 'smart']),
      template_id: z.string().optional(),
      classification: z.enum(['public', 'internal', 'confidential', 'restricted']).optional(),
      detail_level: z.enum(['brief', 'standard', 'deep', 'audit']).optional(),
      tone: z.enum(['formal', 'neutral', 'persuasive', 'urgent']).optional(),
    }).strict(),
  )],
  ['report.template_extract', toolRequestSchema(
    'report.template_extract',
    z.object({
      template_docx: assetRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.plan_outline', toolRequestSchema(
    'report.plan_outline',
    z.object({
      intent: z.object({}).passthrough(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.build_doc_ir', toolRequestSchema(
    'report.build_doc_ir',
    z.object({
      outline: z.object({}).passthrough(),
      template_id: z.string().optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.bind_data', toolRequestSchema(
    'report.bind_data',
    z.object({
      doc: docRefSchema,
      datasets: z.array(datasetRefSchema).optional(),
      tir_steps: z.array(z.object({}).passthrough()).optional(),
      mir_measures: z.array(z.object({}).passthrough()).optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.generate_content_literal', toolRequestSchema(
    'report.generate_content_literal',
    z.object({
      doc: docRefSchema,
      user_text: z.string().min(1),
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.generate_content_smart', toolRequestSchema(
    'report.generate_content_smart',
    z.object({
      doc: docRefSchema,
      prompt: z.string().optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.qa_validate', toolRequestSchema(
    'report.qa_validate',
    z.object({
      doc: docRefSchema,
    }).strict(),
    z.object({
      must_pass_all: z.literal(true),
    }).strict(),
  )],
  ['report.qa_autofix', toolRequestSchema(
    'report.qa_autofix',
    z.object({
      doc: docRefSchema,
      issues: z.array(z.object({}).passthrough()),
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.export_docx', toolRequestSchema(
    'report.export_docx',
    z.object({
      doc: docRefSchema,
    }).strict(),
    z.object({
      embed_fonts: z.boolean().optional(),
    }).strict(),
  )],
  ['report.export_pdf', toolRequestSchema(
    'report.export_pdf',
    z.object({
      doc: docRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.export_html', toolRequestSchema(
    'report.export_html',
    z.object({
      doc: docRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.export_pptx', toolRequestSchema(
    'report.export_pptx',
    z.object({
      doc: docRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.export_xlsx', toolRequestSchema(
    'report.export_xlsx',
    z.object({
      doc: docRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.render_parity_verify', toolRequestSchema(
    'report.render_parity_verify',
    z.object({
      doc: docRefSchema,
      artifacts: z.array(artifactRefSchema).min(1),
    }).strict(),
    z.object({}).strict(),
  )],
  ['report.classify_and_govern', toolRequestSchema(
    'report.classify_and_govern',
    z.object({
      doc: docRefSchema,
      permissions: z.object({}).passthrough().optional(),
      share_policy: z.object({}).passthrough().optional(),
    }).strict(),
    z.object({
      classification: z.enum(['public', 'internal', 'confidential', 'restricted']),
      approvals_enabled: z.boolean().optional(),
    }).strict(),
  )],
  ['report.evidence_pack', toolRequestSchema(
    'report.evidence_pack',
    z.object({
      doc: docRefSchema,
      artifacts: z.array(artifactRefSchema).optional(),
      qa_report: z.object({}).passthrough().optional(),
      parity_report: z.object({}).passthrough().optional(),
      template_compliance: z.object({}).passthrough().optional(),
      literal_diff: z.object({}).passthrough().optional(),
      content_trace: z.object({}).passthrough().optional(),
    }).strict(),
    z.object({}).strict(),
  )],
]);

const responseSchemas = new Map<string, z.ZodTypeAny>([
  ['report.intent_parse', toolResponseSchema(
    'report.intent_parse',
    z.object({
      intent: z.object({}).passthrough(),
    }).strict(),
  )],
  ['report.template_extract', toolResponseSchema(
    'report.template_extract',
    z.object({
      template_id: z.string(),
      style_tokens: z.object({}).passthrough(),
      writing_rules: z.object({}).passthrough(),
      numbering_rules: z.object({}).passthrough(),
      compliance_rules: z.object({}).passthrough(),
    }).strict(),
  )],
  ['report.plan_outline', toolResponseSchema(
    'report.plan_outline',
    z.object({
      outline: z.object({}).passthrough(),
    }).strict(),
  )],
  ['report.build_doc_ir', toolResponseSchema(
    'report.build_doc_ir',
    z.object({
      doc: docRefSchema,
      doc_ir: z.object({}).passthrough(),
    }).strict(),
  )],
  ['report.bind_data', toolResponseSchema(
    'report.bind_data',
    z.object({
      doc: docRefSchema,
      doc_ir: z.object({}).passthrough(),
    }).strict(),
  )],
  ['report.generate_content_literal', toolResponseSchema(
    'report.generate_content_literal',
    z.object({
      doc: docRefSchema,
      literal_hash_report: z.object({}).passthrough(),
    }).strict(),
  )],
  ['report.generate_content_smart', toolResponseSchema(
    'report.generate_content_smart',
    z.object({
      doc: docRefSchema,
      content_trace: z.object({}).passthrough(),
    }).strict(),
  )],
  ['report.qa_validate', toolResponseSchema(
    'report.qa_validate',
    z.object({
      pass: z.boolean(),
      issues: z.array(z.object({}).passthrough()),
      report: z.object({}).passthrough(),
    }).strict(),
  )],
  ['report.qa_autofix', toolResponseSchema(
    'report.qa_autofix',
    z.object({
      doc: docRefSchema,
      fix_log: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['report.export_docx', toolResponseSchema(
    'report.export_docx',
    z.object({
      artifact: artifactRefSchema,
    }).strict(),
  )],
  ['report.export_pdf', toolResponseSchema(
    'report.export_pdf',
    z.object({
      artifact: artifactRefSchema,
    }).strict(),
  )],
  ['report.export_html', toolResponseSchema(
    'report.export_html',
    z.object({
      artifact: artifactRefSchema,
    }).strict(),
  )],
  ['report.export_pptx', toolResponseSchema(
    'report.export_pptx',
    z.object({
      artifact: artifactRefSchema,
    }).strict(),
  )],
  ['report.export_xlsx', toolResponseSchema(
    'report.export_xlsx',
    z.object({
      artifact: artifactRefSchema,
    }).strict(),
  )],
  ['report.render_parity_verify', toolResponseSchema(
    'report.render_parity_verify',
    z.object({
      pass: z.boolean(),
      report: z.object({}).passthrough(),
    }).strict(),
  )],
  ['report.classify_and_govern', toolResponseSchema(
    'report.classify_and_govern',
    z.object({
      doc: docRefSchema,
      governance: z.object({}).passthrough(),
    }).strict(),
  )],
  ['report.evidence_pack', toolResponseSchema(
    'report.evidence_pack',
    z.object({
      evidence_id: z.string(),
    }).strict(),
  )],
]);

export const REPORT_TOOL_DEFINITIONS = [
  { tool_id: 'report.intent_parse', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.intent_parse.input.json', output_schema_ref: 'https://report.local/schemas/report.intent_parse.output.json', required_permissions: ['read:assets', 'read:datasets'] },
  { tool_id: 'report.template_extract', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.template_extract.input.json', output_schema_ref: 'https://report.local/schemas/report.template_extract.output.json', required_permissions: ['read:assets'] },
  { tool_id: 'report.plan_outline', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.plan_outline.input.json', output_schema_ref: 'https://report.local/schemas/report.plan_outline.output.json', required_permissions: ['read:datasets'] },
  { tool_id: 'report.build_doc_ir', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.build_doc_ir.input.json', output_schema_ref: 'https://report.local/schemas/report.build_doc_ir.output.json', required_permissions: ['write:reports'] },
  { tool_id: 'report.bind_data', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.bind_data.input.json', output_schema_ref: 'https://report.local/schemas/report.bind_data.output.json', required_permissions: ['read:datasets', 'write:reports'] },
  { tool_id: 'report.generate_content_literal', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.generate_content_literal.input.json', output_schema_ref: 'https://report.local/schemas/report.generate_content_literal.output.json', required_permissions: ['write:reports'] },
  { tool_id: 'report.generate_content_smart', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.generate_content_smart.input.json', output_schema_ref: 'https://report.local/schemas/report.generate_content_smart.output.json', required_permissions: ['read:datasets', 'write:reports'] },
  { tool_id: 'report.qa_validate', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.qa_validate.input.json', output_schema_ref: 'https://report.local/schemas/report.qa_validate.output.json', required_permissions: ['read:reports'] },
  { tool_id: 'report.qa_autofix', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.qa_autofix.input.json', output_schema_ref: 'https://report.local/schemas/report.qa_autofix.output.json', required_permissions: ['read:reports', 'write:reports'] },
  { tool_id: 'report.export_docx', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.export_docx.input.json', output_schema_ref: 'https://report.local/schemas/report.export_docx.output.json', required_permissions: ['read:reports', 'write:artifacts'] },
  { tool_id: 'report.export_pdf', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.export_pdf.input.json', output_schema_ref: 'https://report.local/schemas/report.export_pdf.output.json', required_permissions: ['read:reports', 'write:artifacts'] },
  { tool_id: 'report.export_html', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.export_html.input.json', output_schema_ref: 'https://report.local/schemas/report.export_html.output.json', required_permissions: ['read:reports', 'write:artifacts'] },
  { tool_id: 'report.export_pptx', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.export_pptx.input.json', output_schema_ref: 'https://report.local/schemas/report.export_pptx.output.json', required_permissions: ['read:reports', 'write:artifacts'] },
  { tool_id: 'report.export_xlsx', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.export_xlsx.input.json', output_schema_ref: 'https://report.local/schemas/report.export_xlsx.output.json', required_permissions: ['read:reports', 'write:artifacts'] },
  { tool_id: 'report.render_parity_verify', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.render_parity_verify.input.json', output_schema_ref: 'https://report.local/schemas/report.render_parity_verify.output.json', required_permissions: ['read:reports', 'read:artifacts'] },
  { tool_id: 'report.classify_and_govern', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.classify_and_govern.input.json', output_schema_ref: 'https://report.local/schemas/report.classify_and_govern.output.json', required_permissions: ['read:reports', 'write:governance'] },
  { tool_id: 'report.evidence_pack', version: '1.0.0', input_schema_ref: 'https://report.local/schemas/report.evidence_pack.input.json', output_schema_ref: 'https://report.local/schemas/report.evidence_pack.output.json', required_permissions: ['read:reports', 'read:artifacts', 'write:evidence'] },
] as const;

export type ReportContractDirection = 'request' | 'response';

export function validateReportToolContract(
  toolId: string,
  direction: ReportContractDirection,
  payload: unknown,
) {
  const schema = direction === 'request'
    ? requestSchemas.get(toolId)
    : responseSchemas.get(toolId);

  if (!schema) {
    throw new Error(`Report tool contract not registered: ${toolId}`);
  }

  return schema.parse(payload);
}
