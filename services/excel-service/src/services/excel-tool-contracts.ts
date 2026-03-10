import { z } from 'zod';

const actionContextSchema = z.object({
  workspace_id: z.string().min(3).max(128),
  user_id: z.string().min(3).max(128),
  mode: z.enum(['SMART', 'PRO']),
  arabic_mode: z.enum(['BASIC', 'PROFESSIONAL', 'ELITE']),
  locale: z.string().min(2).max(16),
}).passthrough();

const assetRefSchema = z.object({
  asset_id: z.string().min(8).max(128),
  uri: z.string().min(1).max(2048),
  mime: z.string().min(3).max(128),
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
  size_bytes: z.number().int().nonnegative(),
}).strict();

const datasetRefSchema = z.object({
  dataset_id: z.string().min(8).max(128),
  row_count_est: z.number().int().nonnegative(),
  column_count: z.number().int().nonnegative(),
}).strict();

const tableRefSchema = z.object({
  table_id: z.string().min(8).max(128),
  dataset_id: z.string().min(8).max(128),
  name: z.string().min(1).max(256),
}).strict();

const columnRefSchema = z.object({
  column_id: z.string().min(8).max(128),
  table_id: z.string().min(8).max(128),
  name: z.string().min(1).max(256),
  dtype: z.enum(['string', 'int', 'float', 'bool', 'date', 'datetime', 'currency', 'percent', 'json', 'unknown']),
}).strict();

const recipeRefSchema = z.object({
  recipe_id: z.string().min(8).max(128),
  kind: z.enum(['TIR', 'COMPARE', 'CLEAN', 'FORMAT']),
  version: z.string().min(1).max(32),
}).strict();

const artifactRefSchema = z.object({
  artifact_id: z.string().min(8).max(128),
  kind: z.enum(['xlsx', 'csv', 'parquet', 'pdf', 'pptx', 'dashboard', 'json']),
  uri: z.string().min(1).max(2048),
}).strict();

const warningsSchema = z.array(z.object({
  code: z.string().min(2).max(64),
  message: z.string().min(1).max(2000),
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
  ['data.ingest.batch', toolRequestSchema(
    'data.ingest.batch',
    z.object({
      assets: z.array(assetRefSchema).min(1),
    }).strict(),
    z.object({
      read_all_sheets: z.literal(true),
      allow_folder_upload: z.boolean().optional(),
    }).strict(),
  )],
  ['data.inspect.preflight', toolRequestSchema(
    'data.inspect.preflight',
    z.object({ dataset: datasetRefSchema }).strict(),
    z.object({}).strict(),
  )],
  ['catalog.build', toolRequestSchema(
    'catalog.build',
    z.object({ dataset: datasetRefSchema }).strict(),
    z.object({}).strict(),
  )],
  ['catalog.unify_columns', toolRequestSchema(
    'catalog.unify_columns',
    z.object({ columns: z.array(columnRefSchema) }).strict(),
    z.object({ apply_mode: z.enum(['smart_apply', 'pro_suggest_only']) }).strict(),
  )],
  ['relation.suggest_joins', toolRequestSchema(
    'relation.suggest_joins',
    z.object({ dataset: datasetRefSchema }).strict(),
    z.object({}).strict(),
  )],
  ['canvas.table.create_empty', toolRequestSchema(
    'canvas.table.create_empty',
    z.object({}).strict(),
    z.object({ name: z.string().min(1) }).strict(),
  )],
  ['canvas.table.add_column', toolRequestSchema(
    'canvas.table.add_column',
    z.object({
      target_table: tableRefSchema,
      source_column: columnRefSchema,
    }).strict(),
    z.object({
      align_mode: z.enum(['append_rows_by_similarity', 'join_by_key', 'add_as_side_column']),
      join_key_columns: z.array(z.string()).optional(),
    }).strict(),
  )],
  ['expr.tir.apply', toolRequestSchema(
    'expr.tir.apply',
    z.object({
      table: tableRefSchema,
      tir_steps: z.array(z.object({}).passthrough()).min(1),
    }).strict(),
    z.object({
      preview_rows: z.number().int().min(50).max(5000),
    }).strict(),
  )],
  ['excel.svm.recalc', toolRequestSchema(
    'excel.svm.recalc',
    z.object({
      workbook_asset: assetRefSchema,
    }).strict(),
    z.object({
      deterministic: z.literal(true),
    }).strict(),
  )],
  ['compare.dataset_diff', toolRequestSchema(
    'compare.dataset_diff',
    z.object({
      left: tableRefSchema,
      right: tableRefSchema,
    }).strict(),
    z.object({
      key_columns: z.array(z.string()).min(1),
    }).strict(),
  )],
  ['format.excel.beautify', toolRequestSchema(
    'format.excel.beautify',
    z.object({
      table: tableRefSchema,
    }).strict(),
    z.object({
      rtl: z.boolean(),
      style_level: z.enum(['standard', 'premium']).optional(),
    }).strict(),
  )],
  ['export.xlsx', toolRequestSchema(
    'export.xlsx',
    z.object({
      tables: z.array(tableRefSchema).min(1),
    }).strict(),
    z.object({
      include_lineage_sheet: z.literal(true),
    }).strict(),
  )],
  ['recipe.save', toolRequestSchema(
    'recipe.save',
    z.object({
      table: tableRefSchema.optional(),
      recipe: z.object({}).passthrough(),
      kind: z.enum(['TIR', 'COMPARE', 'CLEAN', 'FORMAT']),
    }).strict(),
    z.object({
      name: z.string().min(1),
    }).strict(),
  )],
  ['recipe.apply', toolRequestSchema(
    'recipe.apply',
    z.object({
      recipe: recipeRefSchema,
      dataset: datasetRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
  ['ai.excel.intent_parse', toolRequestSchema(
    'ai.excel.intent_parse',
    z.object({
      prompt: z.string().min(1),
      dataset: datasetRefSchema.optional(),
    }).strict(),
    z.object({}).strict(),
  )],
  ['ai.excel.auto_analyze', toolRequestSchema(
    'ai.excel.auto_analyze',
    z.object({
      dataset: datasetRefSchema,
    }).strict(),
    z.object({}).strict(),
  )],
]);

const responseSchemas = new Map<string, z.ZodTypeAny>([
  ['data.ingest.batch', toolResponseSchema(
    'data.ingest.batch',
    z.object({ dataset: datasetRefSchema }).strict(),
  )],
  ['data.inspect.preflight', toolResponseSchema(
    'data.inspect.preflight',
    z.object({
      content_map: z.object({}).passthrough(),
      quality_summary: z.object({}).passthrough(),
      join_suggestions: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['catalog.build', toolResponseSchema(
    'catalog.build',
    z.object({
      columns: z.array(columnRefSchema),
    }).strict(),
  )],
  ['catalog.unify_columns', toolResponseSchema(
    'catalog.unify_columns',
    z.object({
      synonym_groups: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['relation.suggest_joins', toolResponseSchema(
    'relation.suggest_joins',
    z.object({
      suggestions: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['canvas.table.create_empty', toolResponseSchema(
    'canvas.table.create_empty',
    z.object({
      table: tableRefSchema,
    }).strict(),
  )],
  ['canvas.table.add_column', toolResponseSchema(
    'canvas.table.add_column',
    z.object({
      table: tableRefSchema,
    }).strict(),
  )],
  ['expr.tir.apply', toolResponseSchema(
    'expr.tir.apply',
    z.object({
      table: tableRefSchema,
      recipe: recipeRefSchema,
    }).strict(),
  )],
  ['excel.svm.recalc', toolResponseSchema(
    'excel.svm.recalc',
    z.object({
      artifact: artifactRefSchema,
    }).strict(),
  )],
  ['compare.dataset_diff', toolResponseSchema(
    'compare.dataset_diff',
    z.object({
      diff_table: tableRefSchema,
    }).strict(),
  )],
  ['format.excel.beautify', toolResponseSchema(
    'format.excel.beautify',
    z.object({
      recipe: recipeRefSchema,
    }).strict(),
  )],
  ['export.xlsx', toolResponseSchema(
    'export.xlsx',
    z.object({
      artifact: artifactRefSchema,
    }).strict(),
  )],
  ['recipe.save', toolResponseSchema(
    'recipe.save',
    z.object({
      recipe: recipeRefSchema,
    }).strict(),
  )],
  ['recipe.apply', toolResponseSchema(
    'recipe.apply',
    z.object({
      table: tableRefSchema,
      recipe: recipeRefSchema,
    }).strict(),
  )],
  ['ai.excel.intent_parse', toolResponseSchema(
    'ai.excel.intent_parse',
    z.object({
      analysis_report: z.object({}).passthrough(),
      recommended_recipes: z.array(z.object({}).passthrough()),
      recommended_outputs: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
  ['ai.excel.auto_analyze', toolResponseSchema(
    'ai.excel.auto_analyze',
    z.object({
      analysis_report: z.object({}).passthrough(),
      recommended_recipes: z.array(z.object({}).passthrough()),
      recommended_outputs: z.array(z.object({}).passthrough()),
    }).strict(),
  )],
]);

export const EXCEL_TOOL_DEFINITIONS = [
  { tool_id: 'data.ingest.batch', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/data.ingest.batch.input.json', output_schema_ref: 'https://excel.local/schemas/data.ingest.batch.output.json', required_permissions: ['read:assets', 'write:datasets'] },
  { tool_id: 'data.inspect.preflight', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/data.inspect.preflight.input.json', output_schema_ref: 'https://excel.local/schemas/data.inspect.preflight.output.json', required_permissions: ['read:datasets'] },
  { tool_id: 'catalog.build', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/catalog.build.input.json', output_schema_ref: 'https://excel.local/schemas/catalog.build.output.json', required_permissions: ['read:datasets'] },
  { tool_id: 'catalog.unify_columns', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/catalog.unify_columns.input.json', output_schema_ref: 'https://excel.local/schemas/catalog.unify_columns.output.json', required_permissions: ['read:datasets', 'write:recipes'] },
  { tool_id: 'relation.suggest_joins', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/relation.suggest_joins.input.json', output_schema_ref: 'https://excel.local/schemas/relation.suggest_joins.output.json', required_permissions: ['read:datasets'] },
  { tool_id: 'canvas.table.create_empty', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/canvas.table.create_empty.input.json', output_schema_ref: 'https://excel.local/schemas/canvas.table.create_empty.output.json', required_permissions: ['write:tables'] },
  { tool_id: 'canvas.table.add_column', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/canvas.table.add_column.input.json', output_schema_ref: 'https://excel.local/schemas/canvas.table.add_column.output.json', required_permissions: ['read:datasets', 'write:tables'] },
  { tool_id: 'expr.tir.apply', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/expr.tir.apply.input.json', output_schema_ref: 'https://excel.local/schemas/expr.tir.apply.output.json', required_permissions: ['read:tables', 'write:tables', 'write:recipes'] },
  { tool_id: 'excel.svm.recalc', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/excel.svm.recalc.input.json', output_schema_ref: 'https://excel.local/schemas/excel.svm.recalc.output.json', required_permissions: ['read:assets', 'write:artifacts'] },
  { tool_id: 'compare.dataset_diff', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/compare.dataset_diff.input.json', output_schema_ref: 'https://excel.local/schemas/compare.dataset_diff.output.json', required_permissions: ['read:tables', 'write:tables'] },
  { tool_id: 'format.excel.beautify', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/format.excel.beautify.input.json', output_schema_ref: 'https://excel.local/schemas/format.excel.beautify.output.json', required_permissions: ['read:tables', 'write:recipes'] },
  { tool_id: 'export.xlsx', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/export.xlsx.input.json', output_schema_ref: 'https://excel.local/schemas/export.xlsx.output.json', required_permissions: ['read:tables', 'write:artifacts'] },
  { tool_id: 'recipe.save', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/recipe.save.input.json', output_schema_ref: 'https://excel.local/schemas/recipe.save.output.json', required_permissions: ['write:recipes'] },
  { tool_id: 'recipe.apply', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/recipe.apply.input.json', output_schema_ref: 'https://excel.local/schemas/recipe.apply.output.json', required_permissions: ['read:recipes', 'read:datasets', 'write:tables'] },
  { tool_id: 'ai.excel.intent_parse', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/ai.excel.intent_parse.input.json', output_schema_ref: 'https://excel.local/schemas/ai.excel.intent_parse.output.json', required_permissions: ['read:datasets'] },
  { tool_id: 'ai.excel.auto_analyze', version: '1.0.0', input_schema_ref: 'https://excel.local/schemas/ai.excel.auto_analyze.input.json', output_schema_ref: 'https://excel.local/schemas/ai.excel.auto_analyze.output.json', required_permissions: ['read:datasets'] },
] as const;

export type ExcelContractDirection = 'request' | 'response';

export function validateExcelToolContract(
  toolId: string,
  direction: ExcelContractDirection,
  payload: unknown,
) {
  const schema = direction === 'request'
    ? requestSchemas.get(toolId)
    : responseSchemas.get(toolId);

  if (!schema) {
    throw new Error(`Excel tool contract not registered: ${toolId}`);
  }

  return schema.parse(payload);
}
