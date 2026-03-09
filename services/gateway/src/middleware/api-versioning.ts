/**
 * API Versioning Middleware — Rasid Platform
 * واجهات برمجة تطبيقات بإصدارات (Versioned APIs)
 * يغطي: F-04502
 */

import { Request, Response, NextFunction, Router } from 'express';

type ApiVersion = 'v1' | 'v2' | 'v3';

interface VersionConfig {
  version: ApiVersion;
  deprecated: boolean;
  sunsetDate?: Date;
  deprecationMessage?: string;
}

const SUPPORTED_VERSIONS: VersionConfig[] = [
  { version: 'v1', deprecated: false },
  { version: 'v2', deprecated: false },
  { version: 'v3', deprecated: false },
];

const DEFAULT_VERSION: ApiVersion = 'v1';

/**
 * استخراج إصدار API من الطلب
 * يدعم: URL path (/api/v1/...), Header (X-API-Version), Query param (?version=v1)
 */
function extractVersion(req: Request): ApiVersion {
  // 1. URL path-based versioning (primary)
  const pathMatch = req.path.match(/^\/api\/(v\d+)\//);
  if (pathMatch) {
    return pathMatch[1] as ApiVersion;
  }

  // 2. Header-based versioning
  const headerVersion = req.headers['x-api-version'] as string;
  if (headerVersion) {
    return headerVersion as ApiVersion;
  }

  // 3. Query parameter
  const queryVersion = req.query.version as string;
  if (queryVersion) {
    return queryVersion as ApiVersion;
  }

  // 4. Accept header (content negotiation)
  const accept = req.headers.accept ?? '';
  const acceptMatch = accept.match(/application\/vnd\.rasid\.(v\d+)\+json/);
  if (acceptMatch) {
    return acceptMatch[1] as ApiVersion;
  }

  return DEFAULT_VERSION;
}

/**
 * API Versioning Middleware
 */
export function apiVersioning() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const version = extractVersion(req);
    const config = SUPPORTED_VERSIONS.find((v) => v.version === version);

    if (!config) {
      res.status(400).json({
        error: `إصدار API غير مدعوم: ${version}`,
        supportedVersions: SUPPORTED_VERSIONS.map((v) => v.version),
        currentDefault: DEFAULT_VERSION,
      });
      return;
    }

    // Set version in request for downstream handlers
    (req as Record<string, unknown>).apiVersion = version;

    // Add version headers to response
    res.setHeader('X-API-Version', version);
    res.setHeader(
      'X-Supported-Versions',
      SUPPORTED_VERSIONS.map((v) => v.version).join(', ')
    );

    // Add deprecation headers if needed
    if (config.deprecated) {
      res.setHeader('Deprecation', 'true');
      if (config.sunsetDate) {
        res.setHeader('Sunset', config.sunsetDate.toUTCString());
      }
      res.setHeader(
        'X-Deprecation-Notice',
        config.deprecationMessage ?? `الإصدار ${version} سيتم إيقافه قريباً`
      );
    }

    next();
  };
}

/**
 * Version Router — توجيه حسب إصدار API
 */
export function versionedRouter(routes: Partial<Record<ApiVersion, Router>>): Router {
  const router = Router();

  for (const [version, versionRouter] of Object.entries(routes)) {
    if (versionRouter) {
      router.use(`/api/${version}`, versionRouter);
    }
  }

  return router;
}

/**
 * Version Guard — حماية endpoint لإصدار محدد
 */
export function requireVersion(...versions: ApiVersion[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const currentVersion = (req as Record<string, unknown>).apiVersion as ApiVersion;

    if (!versions.includes(currentVersion)) {
      res.status(400).json({
        error: `هذا الـ endpoint متاح فقط في الإصدارات: ${versions.join(', ')}`,
        currentVersion,
      });
      return;
    }

    next();
  };
}

/**
 * Response Transformer — تحويل الاستجابة حسب الإصدار
 */
export function versionedResponse<T>(
  version: ApiVersion,
  data: T,
  transformers: Partial<Record<ApiVersion, (data: T) => unknown>>
): unknown {
  const transformer = transformers[version];
  if (transformer) {
    return transformer(data);
  }
  return data;
}

export { ApiVersion, VersionConfig, SUPPORTED_VERSIONS, DEFAULT_VERSION };
