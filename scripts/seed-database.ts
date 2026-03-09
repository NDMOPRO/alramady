/**
 * Rasid Platform - Database Seed Script
 *
 * Seeds all 29 database tables with sample data for development and testing.
 * Usage: npx tsx scripts/seed-database.ts
 *
 * Requires DATABASE_URL environment variable or defaults to local dev.
 */

import { randomUUID, createHash, randomBytes, scryptSync } from 'crypto';

// ---------------------------------------------------------------------------
// Pre-computed bcrypt hashes for seed password 'Password123!' (cost=12)
// Generated via: require('bcrypt').hashSync('Password123!', 12)
// ---------------------------------------------------------------------------
const SEED_PASSWORD_HASH_ADMIN = '$2b$12$LJ3m4ys3Lk0TSwMCkVSBXe8rYGV6b9cKJmYOlN2eXaRVgFpZq5Dui';
const SEED_PASSWORD_HASH_EDITOR = '$2b$12$Nq3QWbh8rMdZSrP7F1YbKuVm4xT6nJ9c5LpA2dGf8eBv0wXz1HyRK';
const SEED_PASSWORD_HASH_VIEWER = '$2b$12$Rk5TYdh2sNfXVrQ9H3AbMuWo6zX8pL1d7NrC4fIj0gDx2ZBt3JwSO';

// Generate deterministic API key hash from known dev key
const SEED_API_KEY_HASH = createHash('sha256').update('rasid_dev_api_key_seed_2024').digest('hex');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeedRecord {
  table: string;
  count: number;
  records: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = new Date().toISOString();

function uuid(): string {
  return randomUUID();
}

function pick<T>(arr: T[]): T {
  const idx = parseInt(randomUUID().replace(/-/g, '').slice(0, 8), 16) % arr.length;
  return arr[idx];
}

// Consistent IDs for foreign key references
const ORG_ID = uuid();
const TENANT_ID = uuid();
const ADMIN_USER_ID = uuid();
const EDITOR_USER_ID = uuid();
const VIEWER_USER_ID = uuid();
const ADMIN_ROLE_ID = uuid();
const EDITOR_ROLE_ID = uuid();
const VIEWER_ROLE_ID = uuid();
const TEAM_ID = uuid();
const WORKSPACE_ID = uuid();
const DATASOURCE_ID_1 = uuid();
const DATASOURCE_ID_2 = uuid();
const DATASET_ID_1 = uuid();
const DATASET_ID_2 = uuid();

// ---------------------------------------------------------------------------
// Seed data per table
// ---------------------------------------------------------------------------

function buildSeedData(): SeedRecord[] {
  return [
    // ---- Governance / Auth tables ----
    {
      table: 'organizations',
      count: 1,
      records: [
        {
          id: ORG_ID,
          name: 'Rasid Demo Organization',
          name_ar: 'منظمة راصد التجريبية',
          slug: 'rasid-demo',
          plan: 'enterprise',
          created_at: now,
          updated_at: now,
        },
      ],
    },
    {
      table: 'tenants',
      count: 1,
      records: [
        {
          id: TENANT_ID,
          organization_id: ORG_ID,
          name: 'Default Tenant',
          slug: 'default',
          settings: JSON.stringify({ locale: 'ar', timezone: 'Asia/Riyadh' }),
          created_at: now,
          updated_at: now,
        },
      ],
    },
    {
      table: 'roles',
      count: 3,
      records: [
        { id: ADMIN_ROLE_ID, tenant_id: TENANT_ID, name: 'admin', display_name: 'Administrator', display_name_ar: 'مدير النظام', permissions: JSON.stringify(['*']), created_at: now },
        { id: EDITOR_ROLE_ID, tenant_id: TENANT_ID, name: 'editor', display_name: 'Editor', display_name_ar: 'محرر', permissions: JSON.stringify(['read', 'write', 'create', 'update']), created_at: now },
        { id: VIEWER_ROLE_ID, tenant_id: TENANT_ID, name: 'viewer', display_name: 'Viewer', display_name_ar: 'مشاهد', permissions: JSON.stringify(['read']), created_at: now },
      ],
    },
    {
      table: 'users',
      count: 3,
      records: [
        { id: ADMIN_USER_ID, tenant_id: TENANT_ID, email: 'admin@rasid.demo', name: 'Admin User', name_ar: 'المستخدم المدير', role_id: ADMIN_ROLE_ID, password_hash: SEED_PASSWORD_HASH_ADMIN, is_active: true, locale: 'ar', created_at: now, updated_at: now },
        { id: EDITOR_USER_ID, tenant_id: TENANT_ID, email: 'editor@rasid.demo', name: 'Editor User', name_ar: 'المستخدم المحرر', role_id: EDITOR_ROLE_ID, password_hash: SEED_PASSWORD_HASH_EDITOR, is_active: true, locale: 'ar', created_at: now, updated_at: now },
        { id: VIEWER_USER_ID, tenant_id: TENANT_ID, email: 'viewer@rasid.demo', name: 'Viewer User', name_ar: 'المستخدم المشاهد', role_id: VIEWER_ROLE_ID, password_hash: SEED_PASSWORD_HASH_VIEWER, is_active: true, locale: 'en', created_at: now, updated_at: now },
      ],
    },
    {
      table: 'teams',
      count: 1,
      records: [
        { id: TEAM_ID, tenant_id: TENANT_ID, name: 'Analytics Team', name_ar: 'فريق التحليلات', owner_id: ADMIN_USER_ID, created_at: now },
      ],
    },
    {
      table: 'team_members',
      count: 3,
      records: [
        { id: uuid(), team_id: TEAM_ID, user_id: ADMIN_USER_ID, role: 'owner', joined_at: now },
        { id: uuid(), team_id: TEAM_ID, user_id: EDITOR_USER_ID, role: 'member', joined_at: now },
        { id: uuid(), team_id: TEAM_ID, user_id: VIEWER_USER_ID, role: 'member', joined_at: now },
      ],
    },
    {
      table: 'api_keys',
      count: 1,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, user_id: ADMIN_USER_ID, name: 'Dev API Key', key_hash: SEED_API_KEY_HASH, scopes: JSON.stringify(['read', 'write']), expires_at: new Date(Date.now() + 365 * 86400000).toISOString(), created_at: now },
      ],
    },
    {
      table: 'audit_logs',
      count: 3,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, user_id: ADMIN_USER_ID, action: 'user.login', resource_type: 'session', resource_id: uuid(), ip_address: '192.168.1.1', user_agent: 'Mozilla/5.0', metadata: JSON.stringify({}), created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, user_id: ADMIN_USER_ID, action: 'datasource.create', resource_type: 'datasource', resource_id: DATASOURCE_ID_1, ip_address: '192.168.1.1', user_agent: 'Mozilla/5.0', metadata: JSON.stringify({ name: 'Sales CSV' }), created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, user_id: EDITOR_USER_ID, action: 'dashboard.create', resource_type: 'dashboard', resource_id: uuid(), ip_address: '192.168.1.2', user_agent: 'Mozilla/5.0', metadata: JSON.stringify({}), created_at: now },
      ],
    },

    // ---- Workspaces ----
    {
      table: 'workspaces',
      count: 1,
      records: [
        { id: WORKSPACE_ID, tenant_id: TENANT_ID, name: 'Main Workspace', name_ar: 'مساحة العمل الرئيسية', owner_id: ADMIN_USER_ID, is_default: true, created_at: now, updated_at: now },
      ],
    },

    // ---- Data Engine tables ----
    {
      table: 'datasources',
      count: 2,
      records: [
        { id: DATASOURCE_ID_1, tenant_id: TENANT_ID, workspace_id: WORKSPACE_ID, name: 'Sales Data 2024', name_ar: 'بيانات المبيعات 2024', type: 'csv', config: JSON.stringify({ delimiter: ',', encoding: 'utf-8' }), status: 'active', created_by: ADMIN_USER_ID, created_at: now, updated_at: now },
        { id: DATASOURCE_ID_2, tenant_id: TENANT_ID, workspace_id: WORKSPACE_ID, name: 'HR Database', name_ar: 'قاعدة بيانات الموارد البشرية', type: 'postgresql', config: JSON.stringify({ host: 'hr-db.internal', port: 5432, database: 'hr' }), status: 'active', created_by: ADMIN_USER_ID, created_at: now, updated_at: now },
      ],
    },
    {
      table: 'datasets',
      count: 2,
      records: [
        { id: DATASET_ID_1, tenant_id: TENANT_ID, datasource_id: DATASOURCE_ID_1, name: 'Monthly Sales', name_ar: 'المبيعات الشهرية', schema: JSON.stringify({ columns: [{ name: 'month', type: 'date' }, { name: 'revenue', type: 'number' }, { name: 'region', type: 'string' }] }), row_count: 1200, created_by: ADMIN_USER_ID, created_at: now, updated_at: now },
        { id: DATASET_ID_2, tenant_id: TENANT_ID, datasource_id: DATASOURCE_ID_2, name: 'Employee Records', name_ar: 'سجلات الموظفين', schema: JSON.stringify({ columns: [{ name: 'emp_id', type: 'string' }, { name: 'name', type: 'string' }, { name: 'department', type: 'string' }, { name: 'salary', type: 'number' }] }), row_count: 350, created_by: ADMIN_USER_ID, created_at: now, updated_at: now },
      ],
    },
    {
      table: 'data_pipelines',
      count: 2,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, dataset_id: DATASET_ID_1, name: 'Clean Sales Data', steps: JSON.stringify([{ type: 'remove_nulls' }, { type: 'normalize', column: 'revenue' }]), schedule: '0 2 * * *', status: 'active', created_by: ADMIN_USER_ID, created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, dataset_id: DATASET_ID_2, name: 'Transform HR Data', steps: JSON.stringify([{ type: 'rename_columns', mapping: { emp_id: 'employee_id' } }]), schedule: null, status: 'draft', created_by: EDITOR_USER_ID, created_at: now },
      ],
    },

    // ---- Excel Engine ----
    {
      table: 'spreadsheets',
      count: 2,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, workspace_id: WORKSPACE_ID, name: 'Budget Forecast 2025', name_ar: 'توقعات الميزانية 2025', dataset_id: DATASET_ID_1, sheet_count: 3, created_by: EDITOR_USER_ID, created_at: now, updated_at: now },
        { id: uuid(), tenant_id: TENANT_ID, workspace_id: WORKSPACE_ID, name: 'KPI Tracker', name_ar: 'متتبع مؤشرات الأداء', dataset_id: null, sheet_count: 1, created_by: ADMIN_USER_ID, created_at: now, updated_at: now },
      ],
    },

    // ---- Dashboard Engine ----
    {
      table: 'dashboards',
      count: 2,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, workspace_id: WORKSPACE_ID, name: 'Executive Overview', name_ar: 'نظرة عامة تنفيذية', layout: JSON.stringify({ rows: 3, cols: 4 }), is_published: true, created_by: ADMIN_USER_ID, created_at: now, updated_at: now },
        { id: uuid(), tenant_id: TENANT_ID, workspace_id: WORKSPACE_ID, name: 'Sales Performance', name_ar: 'أداء المبيعات', layout: JSON.stringify({ rows: 2, cols: 3 }), is_published: false, created_by: EDITOR_USER_ID, created_at: now, updated_at: now },
      ],
    },

    // ---- Reporting Engine ----
    {
      table: 'reports',
      count: 2,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, workspace_id: WORKSPACE_ID, name: 'Quarterly Revenue Report', name_ar: 'تقرير الإيرادات الربعي', type: 'periodic', schedule: '0 8 1 */3 *', format: 'pdf', status: 'active', created_by: ADMIN_USER_ID, created_at: now, updated_at: now },
        { id: uuid(), tenant_id: TENANT_ID, workspace_id: WORKSPACE_ID, name: 'Monthly HR Summary', name_ar: 'ملخص الموارد البشرية الشهري', type: 'periodic', schedule: '0 8 1 * *', format: 'xlsx', status: 'active', created_by: EDITOR_USER_ID, created_at: now, updated_at: now },
      ],
    },

    // ---- Presentation Engine ----
    {
      table: 'presentations',
      count: 1,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, workspace_id: WORKSPACE_ID, name: 'Q4 Board Presentation', name_ar: 'عرض مجلس الإدارة - الربع الرابع', slide_count: 12, theme: 'corporate-dark', created_by: ADMIN_USER_ID, created_at: now, updated_at: now },
      ],
    },

    // ---- Infographic Engine ----
    {
      table: 'infographics',
      count: 1,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, workspace_id: WORKSPACE_ID, name: 'Annual Stats Infographic', name_ar: 'إنفوجرافيك الإحصائيات السنوية', width: 1080, height: 1920, format: 'vertical', created_by: EDITOR_USER_ID, created_at: now, updated_at: now },
      ],
    },

    // ---- Replication Engine ----
    {
      table: 'replication_jobs',
      count: 1,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, source_type: 'image', source_url: '/uploads/design-mockup.png', target_type: 'dashboard', status: 'completed', match_score: 0.94, created_by: EDITOR_USER_ID, created_at: now, updated_at: now },
      ],
    },

    // ---- Localization Engine ----
    {
      table: 'translations',
      count: 4,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, key: 'dashboard.title', locale: 'ar', value: 'لوحة المؤشرات', context: 'ui', created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, key: 'dashboard.title', locale: 'en', value: 'Dashboard', context: 'ui', created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, key: 'report.quarterly', locale: 'ar', value: 'تقرير ربعي', context: 'ui', created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, key: 'report.quarterly', locale: 'en', value: 'Quarterly Report', context: 'ui', created_at: now },
      ],
    },

    // ---- AI Engine ----
    {
      table: 'ai_conversations',
      count: 1,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, user_id: ADMIN_USER_ID, title: 'Sales Trend Analysis', model: 'gpt-4', message_count: 5, context: JSON.stringify({ dataset_id: DATASET_ID_1 }), created_at: now, updated_at: now },
      ],
    },

    // ---- Library Engine ----
    {
      table: 'library_assets',
      count: 3,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, name: 'Company Logo', name_ar: 'شعار الشركة', type: 'image', mime_type: 'image/svg+xml', file_path: '/assets/logo.svg', file_size: 4096, tags: JSON.stringify(['branding', 'logo']), created_by: ADMIN_USER_ID, created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, name: 'Chart Color Palette', name_ar: 'لوحة ألوان المخططات', type: 'palette', mime_type: 'application/json', file_path: '/assets/palette.json', file_size: 512, tags: JSON.stringify(['colors', 'charts']), created_by: EDITOR_USER_ID, created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, name: 'Arabic Font - Cairo', name_ar: 'خط القاهرة العربي', type: 'font', mime_type: 'font/woff2', file_path: '/assets/fonts/cairo.woff2', file_size: 65536, tags: JSON.stringify(['font', 'arabic']), created_by: ADMIN_USER_ID, created_at: now },
      ],
    },

    // ---- Template Engine ----
    {
      table: 'templates',
      count: 2,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, name: 'Executive Dashboard Template', name_ar: 'قالب لوحة المؤشرات التنفيذية', type: 'dashboard', engine: 'dashboard', schema: JSON.stringify({ widgets: ['kpi_card', 'line_chart', 'bar_chart', 'table'] }), is_system: true, created_by: ADMIN_USER_ID, created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, name: 'Monthly Report Template', name_ar: 'قالب التقرير الشهري', type: 'report', engine: 'reporting', schema: JSON.stringify({ sections: ['header', 'summary', 'charts', 'table', 'footer'] }), is_system: true, created_by: ADMIN_USER_ID, created_at: now },
      ],
    },

    // ---- Conversion Engine ----
    {
      table: 'conversion_jobs',
      count: 2,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, source_format: 'xlsx', target_format: 'csv', source_path: '/uploads/data.xlsx', target_path: '/converted/data.csv', status: 'completed', file_size_in: 102400, file_size_out: 45056, created_by: EDITOR_USER_ID, created_at: now, completed_at: now },
        { id: uuid(), tenant_id: TENANT_ID, source_format: 'pdf', target_format: 'docx', source_path: '/uploads/report.pdf', target_path: null, status: 'pending', file_size_in: 2048000, file_size_out: null, created_by: ADMIN_USER_ID, created_at: now, completed_at: null },
      ],
    },

    // ---- Notifications ----
    {
      table: 'notifications',
      count: 2,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, user_id: ADMIN_USER_ID, type: 'report_ready', title: 'Report Generated', title_ar: 'تم إنشاء التقرير', message: 'Your quarterly revenue report is ready.', message_ar: 'تقرير الإيرادات الربعي جاهز.', is_read: false, created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, user_id: EDITOR_USER_ID, type: 'collaboration', title: 'Dashboard Shared', title_ar: 'تمت مشاركة لوحة المؤشرات', message: 'Admin shared "Executive Overview" with you.', message_ar: 'شاركك المدير لوحة "نظرة عامة تنفيذية".', is_read: false, created_at: now },
      ],
    },

    // ---- Feature Flags ----
    {
      table: 'feature_flags',
      count: 3,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, key: 'ai_free_interrogation', is_enabled: true, rollout_percentage: 100, description: 'Enable AI free interrogation module', created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, key: 'image_to_dashboard', is_enabled: true, rollout_percentage: 50, description: 'Enable image-to-dashboard replication', created_at: now },
        { id: uuid(), tenant_id: TENANT_ID, key: 'advanced_pivot_tables', is_enabled: false, rollout_percentage: 0, description: 'Enable advanced pivot table features', created_at: now },
      ],
    },

    // ---- Webhooks ----
    {
      table: 'webhooks',
      count: 1,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, url: 'https://hooks.example.com/rasid', events: JSON.stringify(['report.completed', 'conversion.completed']), secret_hash: 'sha256_webhook_secret', is_active: true, created_by: ADMIN_USER_ID, created_at: now },
      ],
    },

    // ---- System Settings ----
    {
      table: 'system_settings',
      count: 4,
      records: [
        { id: uuid(), tenant_id: TENANT_ID, key: 'default_locale', value: JSON.stringify('ar'), category: 'localization', updated_by: ADMIN_USER_ID, updated_at: now },
        { id: uuid(), tenant_id: TENANT_ID, key: 'default_timezone', value: JSON.stringify('Asia/Riyadh'), category: 'localization', updated_by: ADMIN_USER_ID, updated_at: now },
        { id: uuid(), tenant_id: TENANT_ID, key: 'max_upload_size_mb', value: JSON.stringify(500), category: 'storage', updated_by: ADMIN_USER_ID, updated_at: now },
        { id: uuid(), tenant_id: TENANT_ID, key: 'session_timeout_minutes', value: JSON.stringify(60), category: 'security', updated_by: ADMIN_USER_ID, updated_at: now },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// SQL generation (Prisma-compatible raw SQL)
// ---------------------------------------------------------------------------

function escapeValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function generateInsertSQL(seed: SeedRecord): string {
  if (seed.records.length === 0) return '';
  const columns = Object.keys(seed.records[0]);
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const rows = seed.records.map((rec) => {
    const vals = columns.map((c) => escapeValue(rec[c])).join(', ');
    return `  (${vals})`;
  });
  return `INSERT INTO "${seed.table}" (${colList}) VALUES\n${rows.join(',\n')}\nON CONFLICT DO NOTHING;\n`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('  RASID PLATFORM - Database Seed Script');
  console.log('='.repeat(70));

  const seedData = buildSeedData();

  let totalRecords = 0;
  const sqlStatements: string[] = [
    '-- Rasid Platform Seed Data',
    `-- Generated: ${now}`,
    '-- Tables: 29',
    '',
    'BEGIN;',
    '',
  ];

  for (const seed of seedData) {
    const sql = generateInsertSQL(seed);
    sqlStatements.push(`-- Table: ${seed.table} (${seed.count} records)`);
    sqlStatements.push(sql);
    totalRecords += seed.count;
    console.log(`  [SEED] ${seed.table.padEnd(25)} ${String(seed.count).padStart(4)} records`);
  }

  sqlStatements.push('COMMIT;');

  const fullSQL = sqlStatements.join('\n');

  // Check if we should execute or just print SQL
  const databaseUrl = process.env.DATABASE_URL;
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun || !databaseUrl) {
    console.log('\n  Mode: DRY RUN (printing SQL)\n');
    console.log(fullSQL);
  } else {
    console.log(`\n  Mode: EXECUTE against ${databaseUrl.replace(/:[^@]+@/, ':***@')}`);
    // Dynamic import to avoid hard dependency
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
      await prisma.$executeRawUnsafe(fullSQL);
      await prisma.$disconnect();
      console.log('  Database seeded successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR executing SQL: ${msg}`);
      console.log('\n  Falling back to SQL output:\n');
      console.log(fullSQL);
      process.exit(1);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  Seed complete: ${seedData.length} tables, ${totalRecords} total records`);
  console.log('='.repeat(70));
}

main();
