interface ApiCheck {
  name: string;
  url: string;
  acceptedStatusCodes: number[];
}

const API_CHECKS: ApiCheck[] = [
  { name: 'Gateway health', url: 'http://localhost:80/health', acceptedStatusCodes: [200] },
  { name: 'Data sources', url: 'http://localhost:80/api/v1/data/sources?limit=1', acceptedStatusCodes: [200, 401] },
  { name: 'Dashboard list', url: 'http://localhost:80/api/v1/dashboard/dashboards?limit=1', acceptedStatusCodes: [200, 401] },
  { name: 'Reports list', url: 'http://localhost:80/api/v1/reporting/reports?limit=1', acceptedStatusCodes: [200, 401] },
  { name: 'Presentations list', url: 'http://localhost:80/api/v1/presentation/presentations?limit=1', acceptedStatusCodes: [200, 401] },
  { name: 'Users list', url: 'http://localhost:80/api/v1/governance/users?limit=1', acceptedStatusCodes: [200, 401] },
  { name: 'Library assets', url: 'http://localhost:80/api/v1/library/assets?limit=1', acceptedStatusCodes: [200, 401] },
];

const TIMEOUT_MS = Number.parseInt(process.argv.find((value) => value.startsWith('--timeout='))?.split('=')[1] ?? '4000', 10);

async function runCheck(check: ApiCheck): Promise<boolean> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(check.url, {
      signal: controller.signal,
      headers: {
        'x-tenant-id': 'default',
      },
    });

    const durationMs = Date.now() - startedAt;
    const ok = check.acceptedStatusCodes.includes(response.status);
    const expected = check.acceptedStatusCodes.join(',');
    console.log(`${ok ? '[OK]' : '[FAIL]'} ${check.name} -> HTTP ${response.status} expected [${expected}] (${durationMs}ms)`);
    return ok;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[FAIL] ${check.name} -> ${message} (${durationMs}ms)`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  console.log(`Checking ${API_CHECKS.length} API routes...`);
  let failed = 0;

  for (const check of API_CHECKS) {
    const ok = await runCheck(check);
    if (!ok) failed += 1;
  }

  if (failed > 0) {
    console.error(`\nAPI verification failed: ${failed}/${API_CHECKS.length} checks failed.`);
    process.exit(1);
  }

  console.log(`\nAPI verification passed: all ${API_CHECKS.length} checks succeeded.`);
}

main().catch((error) => {
  console.error('Unexpected API verification error:', error);
  process.exit(1);
});
