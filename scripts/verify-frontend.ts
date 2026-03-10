const FRONTEND_ROUTES = [
  '/home',
  '/data',
  '/analysis',
  '/reports',
  '/presentations',
  '/library',
  '/settings',
];

const BASE_URL = process.argv.find((value) => value.startsWith('--base='))?.split('=')[1] ?? 'http://localhost:3000';
const TIMEOUT_MS = Number.parseInt(process.argv.find((value) => value.startsWith('--timeout='))?.split('=')[1] ?? '4000', 10);

async function checkRoute(route: string): Promise<boolean> {
  const url = `${BASE_URL}${route}`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { redirect: 'manual', signal: controller.signal });
    const durationMs = Date.now() - startedAt;
    const ok = response.status >= 200 && response.status < 400;
    console.log(`${ok ? '[OK]' : '[FAIL]'} ${route} -> HTTP ${response.status} (${durationMs}ms)`);
    return ok;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[FAIL] ${route} -> ${message} (${durationMs}ms)`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  console.log(`Checking ${FRONTEND_ROUTES.length} frontend routes on ${BASE_URL}...`);
  let failed = 0;

  for (const route of FRONTEND_ROUTES) {
    const ok = await checkRoute(route);
    if (!ok) failed += 1;
  }

  if (failed > 0) {
    console.error(`\nFrontend verification failed: ${failed}/${FRONTEND_ROUTES.length} routes unavailable.`);
    process.exit(1);
  }

  console.log(`\nFrontend verification passed: all ${FRONTEND_ROUTES.length} routes reachable.`);
}

main().catch((error) => {
  console.error('Unexpected frontend verification error:', error);
  process.exit(1);
});
