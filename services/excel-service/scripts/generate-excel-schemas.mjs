import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolsDir = join(__dirname, '..', '..', '..', 'schemas', 'excel', 'tools');
mkdirSync(toolsDir, { recursive: true });

const ref = name => `common.json#/$defs/${name}`;

const schemas = {
  'data.ingest.batch.input.json': {
    $id: 'https://excel.local/schemas/data.ingest.batch.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string', minLength: 8 },
      tool_id: { const: 'data.ingest.batch' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['assets'],
        properties: { assets: { type: 'array', minItems: 1, items: { $ref: ref('AssetRef') } } },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['read_all_sheets'],
        properties: {
          read_all_sheets: { type: 'boolean', const: true },
          allow_folder_upload: { type: 'boolean', default: true },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'data.ingest.batch.output.json': {
    $id: 'https://excel.local/schemas/data.ingest.batch.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'data.ingest.batch' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['dataset'],
        properties: { dataset: { $ref: ref('DatasetRef') } },
        additionalProperties: false,
      },
      warnings: { $ref: ref('Warnings') },
    },
    additionalProperties: false,
  },
  'data.inspect.preflight.input.json': {
    $id: 'https://excel.local/schemas/data.inspect.preflight.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'data.inspect.preflight' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['dataset'],
        properties: { dataset: { $ref: ref('DatasetRef') } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'data.inspect.preflight.output.json': {
    $id: 'https://excel.local/schemas/data.inspect.preflight.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'data.inspect.preflight' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['content_map', 'quality_summary', 'join_suggestions'],
        properties: {
          content_map: { type: 'object' },
          quality_summary: { type: 'object' },
          join_suggestions: { type: 'array', items: { type: 'object' } },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'catalog.build.input.json': {
    $id: 'https://excel.local/schemas/catalog.build.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'catalog.build' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['dataset'],
        properties: { dataset: { $ref: ref('DatasetRef') } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'catalog.build.output.json': {
    $id: 'https://excel.local/schemas/catalog.build.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'catalog.build' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['columns'],
        properties: { columns: { type: 'array', items: { $ref: ref('ColumnRef') } } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'catalog.unify_columns.input.json': {
    $id: 'https://excel.local/schemas/catalog.unify_columns.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'catalog.unify_columns' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['columns'],
        properties: { columns: { type: 'array', items: { $ref: ref('ColumnRef') } } },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['apply_mode'],
        properties: { apply_mode: { type: 'string', enum: ['smart_apply', 'pro_suggest_only'] } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'catalog.unify_columns.output.json': {
    $id: 'https://excel.local/schemas/catalog.unify_columns.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'catalog.unify_columns' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['synonym_groups'],
        properties: { synonym_groups: { type: 'array', items: { type: 'object' } } },
        additionalProperties: false,
      },
      warnings: { $ref: ref('Warnings') },
    },
    additionalProperties: false,
  },
  'relation.suggest_joins.input.json': {
    $id: 'https://excel.local/schemas/relation.suggest_joins.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'relation.suggest_joins' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['dataset'],
        properties: { dataset: { $ref: ref('DatasetRef') } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'relation.suggest_joins.output.json': {
    $id: 'https://excel.local/schemas/relation.suggest_joins.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'relation.suggest_joins' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['suggestions'],
        properties: { suggestions: { type: 'array', items: { type: 'object' } } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'canvas.table.create_empty.input.json': {
    $id: 'https://excel.local/schemas/canvas.table.create_empty.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'canvas.table.create_empty' },
      context: { $ref: ref('ActionContext') },
      inputs: { type: 'object', properties: {}, additionalProperties: false },
      params: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'canvas.table.create_empty.output.json': {
    $id: 'https://excel.local/schemas/canvas.table.create_empty.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'canvas.table.create_empty' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['table'],
        properties: { table: { $ref: ref('TableRef') } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'canvas.table.add_column.input.json': {
    $id: 'https://excel.local/schemas/canvas.table.add_column.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'canvas.table.add_column' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['target_table', 'source_column'],
        properties: {
          target_table: { $ref: ref('TableRef') },
          source_column: { $ref: ref('ColumnRef') },
        },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['align_mode'],
        properties: {
          align_mode: { type: 'string', enum: ['append_rows_by_similarity', 'join_by_key', 'add_as_side_column'] },
          join_key_columns: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'canvas.table.add_column.output.json': {
    $id: 'https://excel.local/schemas/canvas.table.add_column.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'canvas.table.add_column' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['table'],
        properties: { table: { $ref: ref('TableRef') } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'expr.tir.apply.input.json': {
    $id: 'https://excel.local/schemas/expr.tir.apply.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'expr.tir.apply' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['table', 'tir_steps'],
        properties: {
          table: { $ref: ref('TableRef') },
          tir_steps: { type: 'array', minItems: 1, items: { type: 'object' } },
        },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['preview_rows'],
        properties: { preview_rows: { type: 'integer', minimum: 50, maximum: 5000 } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'expr.tir.apply.output.json': {
    $id: 'https://excel.local/schemas/expr.tir.apply.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'expr.tir.apply' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['table', 'recipe'],
        properties: {
          table: { $ref: ref('TableRef') },
          recipe: { $ref: ref('RecipeRef') },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'excel.svm.recalc.input.json': {
    $id: 'https://excel.local/schemas/excel.svm.recalc.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'excel.svm.recalc' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['workbook_asset'],
        properties: { workbook_asset: { $ref: ref('AssetRef') } },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['deterministic'],
        properties: { deterministic: { type: 'boolean', const: true } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'excel.svm.recalc.output.json': {
    $id: 'https://excel.local/schemas/excel.svm.recalc.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'excel.svm.recalc' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['artifact'],
        properties: { artifact: { $ref: ref('ArtifactRef') } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'compare.dataset_diff.input.json': {
    $id: 'https://excel.local/schemas/compare.dataset_diff.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'compare.dataset_diff' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['left', 'right'],
        properties: {
          left: { $ref: ref('TableRef') },
          right: { $ref: ref('TableRef') },
        },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['key_columns'],
        properties: { key_columns: { type: 'array', minItems: 1, items: { type: 'string' } } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'compare.dataset_diff.output.json': {
    $id: 'https://excel.local/schemas/compare.dataset_diff.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'compare.dataset_diff' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['diff_table'],
        properties: { diff_table: { $ref: ref('TableRef') } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'format.excel.beautify.input.json': {
    $id: 'https://excel.local/schemas/format.excel.beautify.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'format.excel.beautify' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['table'],
        properties: { table: { $ref: ref('TableRef') } },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['rtl'],
        properties: {
          rtl: { type: 'boolean' },
          style_level: { type: 'string', enum: ['standard', 'premium'], default: 'premium' },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'format.excel.beautify.output.json': {
    $id: 'https://excel.local/schemas/format.excel.beautify.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'format.excel.beautify' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['recipe'],
        properties: { recipe: { $ref: ref('RecipeRef') } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'export.xlsx.input.json': {
    $id: 'https://excel.local/schemas/export.xlsx.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'export.xlsx' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['tables'],
        properties: { tables: { type: 'array', minItems: 1, items: { $ref: ref('TableRef') } } },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['include_lineage_sheet'],
        properties: { include_lineage_sheet: { type: 'boolean', const: true } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'export.xlsx.output.json': {
    $id: 'https://excel.local/schemas/export.xlsx.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'export.xlsx' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['artifact'],
        properties: { artifact: { $ref: ref('ArtifactRef') } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'recipe.save.input.json': {
    $id: 'https://excel.local/schemas/recipe.save.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'recipe.save' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['recipe', 'kind'],
        properties: {
          table: { $ref: ref('TableRef') },
          recipe: { type: 'object' },
          kind: { type: 'string', enum: ['TIR', 'COMPARE', 'CLEAN', 'FORMAT'] },
        },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'recipe.save.output.json': {
    $id: 'https://excel.local/schemas/recipe.save.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'recipe.save' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['recipe'],
        properties: { recipe: { $ref: ref('RecipeRef') } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'recipe.apply.input.json': {
    $id: 'https://excel.local/schemas/recipe.apply.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'recipe.apply' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['recipe', 'dataset'],
        properties: {
          recipe: { $ref: ref('RecipeRef') },
          dataset: { $ref: ref('DatasetRef') },
        },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'recipe.apply.output.json': {
    $id: 'https://excel.local/schemas/recipe.apply.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'recipe.apply' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['table', 'recipe'],
        properties: {
          table: { $ref: ref('TableRef') },
          recipe: { $ref: ref('RecipeRef') },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'ai.excel.intent_parse.input.json': {
    $id: 'https://excel.local/schemas/ai.excel.intent_parse.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'ai.excel.intent_parse' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1 },
          dataset: { $ref: ref('DatasetRef') },
        },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'ai.excel.intent_parse.output.json': {
    $id: 'https://excel.local/schemas/ai.excel.intent_parse.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'ai.excel.intent_parse' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['analysis_report', 'recommended_recipes', 'recommended_outputs'],
        properties: {
          analysis_report: { type: 'object' },
          recommended_recipes: { type: 'array', items: { type: 'object' } },
          recommended_outputs: { type: 'array', items: { type: 'object' } },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  'ai.excel.auto_analyze.input.json': {
    $id: 'https://excel.local/schemas/ai.excel.auto_analyze.input.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'context', 'inputs', 'params'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'ai.excel.auto_analyze' },
      context: { $ref: ref('ActionContext') },
      inputs: {
        type: 'object',
        required: ['dataset'],
        properties: { dataset: { $ref: ref('DatasetRef') } },
        additionalProperties: false,
      },
      params: { type: 'object', additionalProperties: false },
    },
    additionalProperties: false,
  },
  'ai.excel.auto_analyze.output.json': {
    $id: 'https://excel.local/schemas/ai.excel.auto_analyze.output.json',
    type: 'object',
    required: ['request_id', 'tool_id', 'status', 'refs'],
    properties: {
      request_id: { type: 'string' },
      tool_id: { const: 'ai.excel.auto_analyze' },
      status: { type: 'string', enum: ['ok', 'failed'] },
      refs: {
        type: 'object',
        required: ['analysis_report', 'recommended_recipes', 'recommended_outputs'],
        properties: {
          analysis_report: { type: 'object' },
          recommended_recipes: { type: 'array', items: { type: 'object' } },
          recommended_outputs: { type: 'array', items: { type: 'object' } },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
};

for (const [filename, schema] of Object.entries(schemas)) {
  writeFileSync(join(toolsDir, filename), `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
}

console.log(`generated ${Object.keys(schemas).length} excel schemas`);
