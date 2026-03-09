/**
 * Rasid Platform - Health Check Script
 *
 * Pings all 13 microservices and reports their health status.
 * Usage: npx tsx scripts/health-check.ts [--gateway] [--timeout=5000]
 */

interface ServiceDefinition {
  name: string;
  port: number;
  slug: string;
}

interface HealthResult {
  service: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'timeout' | 'error';
  statusCode?: number;
  responseTimeMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

const SERVICES: ServiceDefinition[] = [
  { name: 'Data Engine',         port: 8001, slug: 'data' },
  { name: 'Excel Engine',        port: 8002, slug: 'excel' },
  { name: 'Dashboard Engine',    port: 8003, slug: 'dashboard' },
  { name: 'Reporting Engine',    port: 8004, slug: 'reporting' },
  { name: 'Presentation Engine', port: 8005, slug: 'presentation' },
  { name: 'Infographic Engine',  port: 8006, slug: 'infographic' },
  { name: 'Replication Engine',  port: 8007, slug: 'replication' },
  { name: 'Localization Engine', port: 8008, slug: 'localization' },
  { name: 'AI Engine',           port: 8009, slug: 'ai' },
  { name: 'Governance Engine',   port: 8010, slug: 'governance' },
  { name: 'Library Engine',      port: 8011, slug: 'library' },
  { name: 'Template Engine',     port: 8012, slug: 'template' },
  { name: 'Conversion Engine',   port: 8013, slug: 'conversion' },
];

const INFRA_SERVICES = [
  { name: 'Gateway (nginx)',  url: 'http://localhost:80/health' },
  { name: 'Frontend (Next.js)', url: 'http://localhost:3000' },
];

function parseArgs(): { useGateway: boolean; timeout: number; baseHost: string } {
  const args = process.argv.slice(2);
  const useGateway = args.includes('--gateway');
  const timeoutArg = args.find((a) => a.startsWith('--timeout='));
  const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1], 10) : 5000;
  const hostArg = args.find((a) => a.startsWith('--host='));
  const baseHost = hostArg ? hostArg.split('=')[1] : 'localhost';
  return { useGateway, timeout, baseHost };
}

async function checkHealth(
  name: string,
  url: string,
  timeoutMs: number,
): Promise<HealthResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    const responseTimeMs = Date.now() - start;
    let details: Record<string, unknown> | undefined;
    try {
      details = await response.json() as Record<string, unknown>;
    } catch {
      // Response may not be JSON
    }

    return {
      service: name,
      url,
      status: response.ok ? 'healthy' : 'unhealthy',
      statusCode: response.status,
      responseTimeMs,
      details,
    };
  } catch (err: unknown) {
    const responseTimeMs = Date.now() - start;
    const error = err instanceof Error ? err : new Error(String(err));
    const isTimeout = error.name === 'AbortError';
    return {
      service: name,
      url,
      status: isTimeout ? 'timeout' : 'error',
      responseTimeMs,
      error: error.message,
    };
  }
}

function printResult(result: HealthResult): void {
  const icon =
    result.status === 'healthy'
      ? '[OK]'
      : result.status === 'timeout'
        ? '[TIMEOUT]'
        : '[FAIL]';
  const code = result.statusCode ? ` (${result.statusCode})` : '';
  console.log(
    `  ${icon.padEnd(10)} ${result.service.padEnd(25)} ${result.responseTimeMs.toString().padStart(6)}ms${code}  ${result.url}`,
  );
  if (result.error) {
    console.log(`             -> ${result.error}`);
  }
}

async function main(): Promise<void> {
  const { useGateway, timeout, baseHost } = parseArgs();

  console.log('='.repeat(90));
  console.log('  RASID PLATFORM - Health Check');
  console.log(`  Mode: ${useGateway ? 'Gateway (via nginx)' : 'Direct (service ports)'}`);
  console.log(`  Host: ${baseHost}  |  Timeout: ${timeout}ms`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('='.repeat(90));

  // Build URLs
  const checks: Array<{ name: string; url: string }> = SERVICES.map((svc) => {
    if (useGateway) {
      return {
        name: svc.name,
        url: `http://${baseHost}/api/v1/${svc.slug}/health`,
      };
    }
    return {
      name: svc.name,
      url: `http://${baseHost}:${svc.port}/api/v1/${svc.slug}/health`,
    };
  });

  // Check all 13 services in parallel
  console.log('\n  Microservices (13):');
  console.log('  ' + '-'.repeat(86));
  const results = await Promise.all(
    checks.map((c) => checkHealth(c.name, c.url, timeout)),
  );
  results.forEach(printResult);

  // Check infrastructure
  console.log('\n  Infrastructure:');
  console.log('  ' + '-'.repeat(86));
  const infraResults = await Promise.all(
    INFRA_SERVICES.map((svc) => {
      const url = svc.url.replace('localhost', baseHost);
      return checkHealth(svc.name, url, timeout);
    }),
  );
  infraResults.forEach(printResult);

  // Summary
  const allResults = [...results, ...infraResults];
  const healthy = allResults.filter((r) => r.status === 'healthy').length;
  const total = allResults.length;
  const avgTime = Math.round(
    allResults.reduce((sum, r) => sum + r.responseTimeMs, 0) / total,
  );

  console.log('\n' + '='.repeat(90));
  console.log(
    `  Summary: ${healthy}/${total} services healthy  |  Avg response: ${avgTime}ms`,
  );
  console.log('='.repeat(90));

  // Exit with error code if any service is unhealthy
  if (healthy < total) {
    console.log('\n  WARNING: Some services are not healthy. Check logs above.\n');
    process.exit(1);
  } else {
    console.log('\n  All services are healthy.\n');
    process.exit(0);
  }
}

main();
