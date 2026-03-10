import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join, resolve } from 'path';

export interface RuntimeRegistryEntry {
  tool_id: string;
  service: string;
  execute_url: string;
  required_permissions: string[];
  evidence_required: boolean;
  strict_profile: 'STRICT_PIXEL_LOCK_FINAL' | 'NONE';
  async_mode: 'sync' | 'async';
  input_schema_path: string;
  output_schema_path: string | null;
}

interface ToolSchemaProperties {
  properties?: {
    tool_id?: {
      const?: string;
    };
  };
}

const DEFAULT_SERVICE_PORTS: Record<string, string> = {
  'presentation-service': process.env.PRESENTATION_SERVICE_PORT || '8005',
  'excel-service': process.env.EXCEL_SERVICE_PORT || '8002',
  'dashboard-service': process.env.DASHBOARD_SERVICE_PORT || '8003',
  'reporting-service': process.env.REPORTING_SERVICE_PORT || '8004',
  'conversion-service': process.env.CONVERSION_SERVICE_PORT || '8013',
  'replication-service': process.env.REPLICATION_SERVICE_PORT || '8007',
  'ai-service': process.env.AI_SERVICE_PORT || '8009',
};

const STRICT_TOOL_IDS = new Set([
  'verify.pixel_diff',
  'repair.loop_controller',
  'render.validate_determinism',
  'extract.pdf_dom',
  'extract.image_segments',
  'cdr.build_design_from_pdf',
  'cdr.build_design_from_image',
  'cdr.build_table_from_image',
  'fonts.embed_full_glyph',
  'export.pptx_from_cdr',
  'export.docx_from_cdr',
  'export.xlsx_from_table_cdr',
  'export.dashboard_from_cdr',
]);

function resolveWorkspaceRoot(startDir = process.cwd()): string {
  let current = resolve(startDir);

  while (true) {
    if (existsSync(join(current, 'schemas')) && existsSync(join(current, 'services'))) {
      return current;
    }

    const parent = resolve(current, '..');
    if (parent === current) {
      throw new Error(`Unable to resolve workspace root from ${startDir}`);
    }
    current = parent;
  }
}

function walkJsonFiles(dir: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkJsonFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.input.json')) {
      output.push(fullPath);
    }
  }
  return output;
}

function parseToolId(schemaPath: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(schemaPath, 'utf8')) as ToolSchemaProperties;
    return parsed.properties?.tool_id?.const ?? basename(schemaPath).replace(/\.input\.json$/, '');
  } catch {
    return basename(schemaPath).replace(/\.input\.json$/, '');
  }
}

function inferService(toolId: string): string {
  if (toolId.startsWith('slides.')) return 'presentation-service';
  if (toolId.startsWith('dashboard.')) return 'dashboard-service';
  if (toolId.startsWith('report.')) return 'reporting-service';
  if (
    toolId.startsWith('data.')
    || toolId.startsWith('catalog.')
    || toolId.startsWith('relation.')
    || toolId.startsWith('canvas.')
    || toolId.startsWith('expr.')
    || toolId.startsWith('excel.')
    || toolId.startsWith('compare.')
    || toolId.startsWith('format.')
    || toolId.startsWith('export.')
    || toolId.startsWith('recipe.')
    || toolId.startsWith('ai.excel.')
  ) return 'excel-service';
  if (toolId.startsWith('lct.') || toolId.startsWith('verifier.')) return 'conversion-service';
  if (toolId.startsWith('rased.')) return 'ai-service';
  return 'replication-service';
}

function inferPermissions(toolId: string): string[] {
  if (toolId.startsWith('slides.')) return ['slides:execute'];
  if (toolId.startsWith('dashboard.')) return ['dashboard:execute'];
  if (toolId.startsWith('report.')) return ['report:execute'];
  if (toolId.startsWith('lct.') || toolId.startsWith('verifier.')) return ['conversion:execute'];
  if (toolId.startsWith('rased.')) return ['ai:execute'];
  if (
    toolId.startsWith('data.')
    || toolId.startsWith('catalog.')
    || toolId.startsWith('relation.')
    || toolId.startsWith('canvas.')
    || toolId.startsWith('expr.')
    || toolId.startsWith('excel.')
    || toolId.startsWith('compare.')
    || toolId.startsWith('format.')
    || toolId.startsWith('export.')
    || toolId.startsWith('recipe.')
    || toolId.startsWith('ai.excel.')
  ) return ['excel:execute'];
  return ['replication:execute'];
}

function executeUrlForService(service: string): string {
  const port = DEFAULT_SERVICE_PORTS[service];
  if (!port) {
    throw new Error(`Missing service port mapping for ${service}`);
  }
  return `http://localhost:${port}/api/v1/tools/execute`;
}

function inferEvidenceRequired(toolId: string): boolean {
  return /evidence_pack|export|publish|strict|repair\.loop_controller|lct\.orch\.any_to_any/i.test(toolId);
}

function inferAsyncMode(toolId: string): 'sync' | 'async' {
  return inferEvidenceRequired(toolId) || /build|render|publish|ingest|recalc/i.test(toolId) ? 'async' : 'sync';
}

export class RuntimeRegistryService {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot = resolveWorkspaceRoot()) {
    this.workspaceRoot = workspaceRoot;
  }

  listTools(): RuntimeRegistryEntry[] {
    const schemasRoot = join(this.workspaceRoot, 'schemas');
    const inputSchemas = walkJsonFiles(schemasRoot);

    return inputSchemas
      .map((inputSchemaPath) => {
        const toolId = parseToolId(inputSchemaPath);
        if (!toolId) {
          return null;
        }

        const service = inferService(toolId);
        const outputSchemaPath = inputSchemaPath.replace(/\.input\.json$/, '.output.json');

        return {
          tool_id: toolId,
          service,
          execute_url: executeUrlForService(service),
          required_permissions: inferPermissions(toolId),
          evidence_required: inferEvidenceRequired(toolId),
          strict_profile: STRICT_TOOL_IDS.has(toolId) ? 'STRICT_PIXEL_LOCK_FINAL' : 'NONE',
          async_mode: inferAsyncMode(toolId),
          input_schema_path: inputSchemaPath,
          output_schema_path: existsSync(outputSchemaPath) ? outputSchemaPath : null,
        } satisfies RuntimeRegistryEntry;
      })
      .filter((entry): entry is RuntimeRegistryEntry => Boolean(entry))
      .sort((left, right) => left.tool_id.localeCompare(right.tool_id, 'en'));
  }

  getTool(toolId: string): RuntimeRegistryEntry | null {
    return this.listTools().find((entry) => entry.tool_id === toolId) ?? null;
  }
}
