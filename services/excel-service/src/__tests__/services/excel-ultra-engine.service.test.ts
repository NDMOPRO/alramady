import { createHash } from 'crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ExcelJS from 'exceljs';
import {
  executeExcelTool,
  getArtifact,
  getDataset,
  getTable,
  listExcelTools,
  resetExcelUltraEngine,
} from '../../services/excel-ultra-engine.service.js';

const context = {
  workspace_id: 'workspace-1',
  user_id: 'user-1',
  mode: 'SMART' as const,
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
    size_bytes: buffer.length,
  };
}

describe('excel ultra engine service', () => {
  beforeEach(() => {
    resetExcelUltraEngine();
  });

  it('executes the core excel tools end-to-end with real artifacts', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'rasid-excel-ultra-'));
    const csvPath = join(tempDir, 'customers.csv');
    const xlsxPath = join(tempDir, 'sales.xlsx');
    const formulaPath = join(tempDir, 'formula.xlsx');

    writeFileSync(csvPath, 'customer_id,region,segment\nC001,East,Enterprise\nC002,West,SMB\nC003,North,Enterprise\n', 'utf8');

    const salesWorkbook = new ExcelJS.Workbook();
    const ordersSheet = salesWorkbook.addWorksheet('Orders');
    ordersSheet.addRow(['customer_id', 'revenue', 'order_date']);
    ordersSheet.addRow(['C001', 1200, '2024-01-31']);
    ordersSheet.addRow(['C002', 1800, '2024-02-29']);
    ordersSheet.addRow(['C003', 900, '2024-03-31']);
    await salesWorkbook.xlsx.writeFile(xlsxPath);

    const formulaWorkbook = new ExcelJS.Workbook();
    const calcSheet = formulaWorkbook.addWorksheet('Calc');
    calcSheet.getCell('A1').value = 100;
    calcSheet.getCell('A2').value = 200;
    calcSheet.getCell('A3').value = { formula: 'SUM(A1:A2)' };
    calcSheet.getCell('B1').value = { formula: 'A3*0.1' };
    await formulaWorkbook.xlsx.writeFile(formulaPath);

    const ingest = await executeExcelTool({
      request_id: 'req-ingest',
      tool_id: 'data.ingest.batch',
      context,
      inputs: {
        assets: [
          makeAsset('asset_sales', xlsxPath, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
          makeAsset('asset_customers', csvPath, 'text/csv'),
        ],
      },
      params: {
        read_all_sheets: true,
        allow_folder_upload: true,
      },
    });
    const ingestDataset = ingest.refs.dataset as { dataset_id: string; row_count_est: number; column_count: number };

    const dataset = getDataset(ingestDataset.dataset_id);
    expect(dataset).toBeDefined();
    expect(dataset?.table_ids.length).toBeGreaterThanOrEqual(2);

    const preflight = await executeExcelTool({
      request_id: 'req-preflight',
      tool_id: 'data.inspect.preflight',
      context,
      inputs: { dataset: ingestDataset },
      params: {},
    });
    const catalog = await executeExcelTool({
      request_id: 'req-catalog',
      tool_id: 'catalog.build',
      context,
      inputs: { dataset: ingestDataset },
      params: {},
    });
    const unified = await executeExcelTool({
      request_id: 'req-unify',
      tool_id: 'catalog.unify_columns',
      context,
      inputs: { columns: catalog.refs.columns },
      params: { apply_mode: 'smart_apply' },
    });
    const joins = await executeExcelTool({
      request_id: 'req-joins',
      tool_id: 'relation.suggest_joins',
      context,
      inputs: { dataset: ingestDataset },
      params: {},
    });
    const synonymGroups = unified.refs.synonym_groups as Array<{ canonical_name: string }>;
    const joinSuggestions = joins.refs.suggestions as Array<Record<string, unknown>>;

    expect(Array.isArray(preflight.refs.join_suggestions)).toBe(true);
    expect(synonymGroups.some(group => group.canonical_name === 'customer_id')).toBe(true);
    expect(joinSuggestions.length).toBeGreaterThan(0);

    const tables = dataset!.table_ids.map(tableId => getTable(tableId)).filter((table): table is NonNullable<ReturnType<typeof getTable>> => Boolean(table));
    const salesTable = tables.find(table => table.name.includes('orders'));
    const customersTable = tables.find(table => table.name.includes('customers'));
    expect(salesTable).toBeDefined();
    expect(customersTable).toBeDefined();

    const emptyCanvas = await executeExcelTool({
      request_id: 'req-empty',
      tool_id: 'canvas.table.create_empty',
      context,
      inputs: {},
      params: { name: 'master_table' },
    });

    const customerIdColumn = salesTable!.columns.find(column => column.name === 'customer_id');
    const revenueColumn = salesTable!.columns.find(column => column.name === 'revenue');
    const regionColumn = customersTable!.columns.find(column => column.name === 'region');
    expect(customerIdColumn).toBeDefined();
    expect(revenueColumn).toBeDefined();
    expect(regionColumn).toBeDefined();

    const customerIdRef = {
      column_id: customerIdColumn!.column_id,
      table_id: customerIdColumn!.table_id,
      name: customerIdColumn!.name,
      dtype: customerIdColumn!.dtype,
    };
    const revenueRef = {
      column_id: revenueColumn!.column_id,
      table_id: revenueColumn!.table_id,
      name: revenueColumn!.name,
      dtype: revenueColumn!.dtype,
    };
    const regionRef = {
      column_id: regionColumn!.column_id,
      table_id: regionColumn!.table_id,
      name: regionColumn!.name,
      dtype: regionColumn!.dtype,
    };

    const withCustomer = await executeExcelTool({
      request_id: 'req-add-customer',
      tool_id: 'canvas.table.add_column',
      context,
      inputs: {
        target_table: emptyCanvas.refs.table,
        source_column: customerIdRef,
      },
      params: {
        align_mode: 'add_as_side_column',
      },
    });

    const withRevenue = await executeExcelTool({
      request_id: 'req-add-revenue',
      tool_id: 'canvas.table.add_column',
      context,
      inputs: {
        target_table: withCustomer.refs.table,
        source_column: revenueRef,
      },
      params: {
        align_mode: 'add_as_side_column',
      },
    });

    const withRegion = await executeExcelTool({
      request_id: 'req-add-region',
      tool_id: 'canvas.table.add_column',
      context,
      inputs: {
        target_table: withRevenue.refs.table,
        source_column: regionRef,
      },
      params: {
        align_mode: 'join_by_key',
        join_key_columns: ['customer_id'],
      },
    });
    const masterTableRef = withRegion.refs.table as { table_id: string; dataset_id: string; name: string };

    const masterTable = getTable(masterTableRef.table_id);
    expect(masterTable?.rows[0].region).toBe('East');
    expect(masterTable?.rows).toHaveLength(3);

    const tir = await executeExcelTool({
      request_id: 'req-tir',
      tool_id: 'expr.tir.apply',
      context,
      inputs: {
        table: masterTableRef,
        tir_steps: [
          { op: 'rename', column: 'revenue', to: 'total_sales' },
          { op: 'derive', column: 'sales_vat', expression: '[total_sales] * 0.15' },
          { op: 'filter', column: 'region', operator: 'not_null' },
          { op: 'sort', column: 'customer_id', direction: 'asc' },
        ],
      },
      params: {
        preview_rows: 100,
      },
    });

    const savedRecipe = await executeExcelTool({
      request_id: 'req-recipe-save',
      tool_id: 'recipe.save',
      context,
      inputs: {
        table: masterTableRef,
        recipe: {
          steps: [
            { op: 'derive', column: 'sales_bucket', expression: '[revenue] / 1000' },
          ],
        },
        kind: 'TIR',
      },
      params: {
        name: 'sales_bucket_recipe',
      },
    });

    const appliedRecipe = await executeExcelTool({
      request_id: 'req-recipe-apply',
      tool_id: 'recipe.apply',
      context,
      inputs: {
        recipe: savedRecipe.refs.recipe as any,
        dataset: ingestDataset,
      },
      params: {},
    });

    const diff = await executeExcelTool({
      request_id: 'req-diff',
      tool_id: 'compare.dataset_diff',
      context,
      inputs: {
        left: masterTableRef,
        right: appliedRecipe.refs.table,
      },
      params: {
        key_columns: ['customer_id'],
      },
    });

    const beautify = await executeExcelTool({
      request_id: 'req-beautify',
      tool_id: 'format.excel.beautify',
      context,
      inputs: {
        table: tir.refs.table,
      },
      params: {
        rtl: true,
        style_level: 'premium',
      },
    });

    const intent = await executeExcelTool({
      request_id: 'req-intent',
      tool_id: 'ai.excel.intent_parse',
      context,
      inputs: {
        prompt: 'قارن المبيعات حسب المنطقة وابن KPI ومخطط',
        dataset: ingestDataset,
      },
      params: {},
    });

    const analysis = await executeExcelTool({
      request_id: 'req-analysis',
      tool_id: 'ai.excel.auto_analyze',
      context,
      inputs: {
        dataset: ingestDataset,
      },
      params: {},
    });
    const beautifyRecipe = beautify.refs.recipe as { recipe_id: string };
    const intentReport = intent.refs.analysis_report as { objective: string };
    const analysisOutputs = analysis.refs.recommended_outputs as Array<Record<string, unknown>>;

    const exported = await executeExcelTool({
      request_id: 'req-export',
      tool_id: 'export.xlsx',
      context,
      inputs: {
        tables: [tir.refs.table, diff.refs.diff_table],
      },
      params: {
        include_lineage_sheet: true,
      },
    });
    const exportedArtifact = exported.refs.artifact as { artifact_id: string; uri: string };

    expect(beautifyRecipe.recipe_id).toBeTruthy();
    expect(intentReport.objective).toBe('comparison');
    expect(analysisOutputs.length).toBeGreaterThan(0);
    expect(existsSync(exportedArtifact.uri)).toBe(true);
    expect(getArtifact(exportedArtifact.artifact_id)?.evidence_uri).toBeTruthy();

    const exportedWorkbook = new ExcelJS.Workbook();
    await exportedWorkbook.xlsx.readFile(exportedArtifact.uri);
    expect(exportedWorkbook.worksheets.some(sheet => sheet.name === 'lineage_meta')).toBe(true);

    const recalc = await executeExcelTool({
      request_id: 'req-recalc',
      tool_id: 'excel.svm.recalc',
      context,
      inputs: {
        workbook_asset: makeAsset('asset_formula', formulaPath, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      },
      params: {
        deterministic: true,
      },
    });
    const recalcArtifact = recalc.refs.artifact as { uri: string };

    const recalculatedWorkbook = new ExcelJS.Workbook();
    await recalculatedWorkbook.xlsx.readFile(recalcArtifact.uri);
    const a3 = recalculatedWorkbook.getWorksheet('Calc')?.getCell('A3').value as ExcelJS.CellFormulaValue;
    const b1 = recalculatedWorkbook.getWorksheet('Calc')?.getCell('B1').value as ExcelJS.CellFormulaValue;
    expect(a3.result).toBe(300);
    expect(b1.result).toBe(30);

    expect(listExcelTools()).toHaveLength(16);
  });

  it('rejects malformed requests by contract', async () => {
    await expect(executeExcelTool({
      request_id: 'req-bad',
      tool_id: 'export.xlsx',
      context,
      inputs: {},
      params: {
        include_lineage_sheet: true,
      },
    } as any)).rejects.toThrow('tables');
  });
});
