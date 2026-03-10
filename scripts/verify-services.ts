interface ServiceDefinition {
  name: string;
  url: string;
}

const DEFAULT_TIMEOUT_MS = 4000;

const SERVICES: ServiceDefinition[] = [
  { name: 'Data Engine', url: 'http://localhost:8001/health' },
  { name: 'Excel Engine', url: 'http://localhost:8002/health' },
  { name: 'Dashboard Engine', url: 'http://localhost:8003/health' },
  { name: 'Reporting Engine', url: 'http://localhost:8004/health' },
  { name: 'Presentation Engine', url: 'http://localhost:8005/health' },
  { name: 'Infographic Engine', url: 'http://localhost:8006/health' },
  { name: 'Replication Engine', url: 'http://localhost:8007/health' },
  { name: 'Localization Engine', url: 'http://localhost:8008/health' },
  { name: 'AI Engine', url: 'http://localhost:8009/health' },
  { name: 'Governance Engine', url: 'http://localhost:8010/health' },
  { name: 'Library Engine', url: 'http://localhost:8011/health' },
  { name: 'Template Engine', url: 'http://localhost:8012/health' },
  { name: 'Conversion Engine', url: 'http://localhost:8013/health' },
  { name: 'Gateway', url: 'http://localhost:80/health' },
  { name: 'Frontend', url: 'http://localhost:3000/' },
];

function getTimeout(): number {
  const arg = process.argv.find((value) => value.startsWith('--timeout='));
  if (!arg) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(arg.split('=')[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

async function checkService(service: ServiceDefinition, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(service.url, { signal: controller.signal });
    const durationMs = Date.now() - startedAt;
    const ok = response.status >= 200 && response.status < 300;
    const marker = ok ? '[OK]' : '[FAIL]';
    console.log(`${marker} ${service.name} -> HTTP ${response.status} (${durationMs}ms) ${service.url}`);
    return ok;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[FAIL] ${service.name} -> ${message} (${durationMs}ms) ${service.url}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const timeout = getTimeout();
  console.log(`Checking ${SERVICES.length} services with timeout ${timeout}ms...`);

  let failed = 0;
  for (const service of SERVICES) {
    const ok = await checkService(service, timeout);
    if (!ok) {
      failed += 1;
    }
  }

  if (failed > 0) {
    console.error(`\nVerification failed: ${failed}/${SERVICES.length} services are unhealthy.`);
    process.exit(1);
  }

  console.log(`\nVerification passed: all ${SERVICES.length} services are healthy.`);
}

main().catch((error) => {
  console.error('Unexpected verification error:', error);
  process.exit(1);
});
