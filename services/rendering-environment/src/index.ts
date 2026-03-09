import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'rendering-environment' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '100mb' }));

const PORT = parseInt(process.env.PORT || '8014', 10);

const RENDER_CONFIG = {
  dpi: parseInt(process.env.DPI || '150', 10),
  antiAliasing: false,
  fontHinting: 'full',
  subpixelRendering: false,
  colorSpace: 'srgb',
  chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  viewportWidth: 1920,
  viewportHeight: 1080,
} as const;

const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  `--force-device-scale-factor=${RENDER_CONFIG.dpi / 96}`,
  '--font-render-hinting=full',
  '--disable-lcd-text',
  '--disable-accelerated-2d-canvas',
  '--disable-composited-antialiasing',
  '--run-all-compositor-stages-before-draw',
  '--disable-partial-raster',
  '--disable-skia-runtime-opts',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--disable-translate',
  '--disable-default-apps',
  '--no-first-run',
  '--disable-threaded-animation',
  '--disable-threaded-scrolling',
  '--disable-checker-imaging',
  '--deterministic-mode',
];

// Persistent browser instance for deterministic rendering
let browserInstance: Awaited<ReturnType<typeof import('puppeteer-core')['launch']>> | null = null;

async function getBrowser(): Promise<Awaited<ReturnType<typeof import('puppeteer-core')['launch']>>> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  const puppeteer = await import('puppeteer-core');
  browserInstance = await puppeteer.launch({
    executablePath: RENDER_CONFIG.chromiumPath,
    headless: true,
    args: CHROMIUM_ARGS,
  });

  browserInstance.on('disconnected', () => {
    logger.warn('Browser disconnected, will relaunch on next request');
    browserInstance = null;
  });

  logger.info('Persistent browser instance launched');
  return browserInstance;
}

// Health endpoint
app.get('/health', (_, res) => {
  res.json({
    status: 'healthy',
    service: 'rendering-environment',
    config: RENDER_CONFIG,
    browserConnected: browserInstance?.connected ?? false,
  });
});

app.get('/api/v1/render/ready', (_, res) => {
  res.json({ ready: true, config: RENDER_CONFIG });
});

// Render HTML to image — deterministic pipeline
app.post('/api/v1/render/html-to-image', async (req, res) => {
  try {
    const { html, width, height, format: outputFormat } = req.body as {
      html: string;
      width: number;
      height: number;
      format: 'png' | 'jpeg' | 'webp';
    };

    if (!html) {
      res.status(400).json({ error: 'html is required' });
      return;
    }

    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      const renderWidth = width || RENDER_CONFIG.viewportWidth;
      const renderHeight = height || RENDER_CONFIG.viewportHeight;

      await page.setViewport({
        width: renderWidth,
        height: renderHeight,
        deviceScaleFactor: RENDER_CONFIG.dpi / 96,
      });

      // Block all external network requests for deterministic rendering
      await page.setRequestInterception(true);
      page.on('request', (interceptedRequest) => {
        const url = interceptedRequest.url();
        // Allow only data: URIs and about:blank — block all network fonts/images
        if (url.startsWith('data:') || url.startsWith('about:') || url.startsWith('blob:')) {
          interceptedRequest.continue();
        } else {
          interceptedRequest.abort('blockedbyclient');
        }
      });

      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });

      // Wait for all fonts to be loaded from local system
      await page.evaluate(() => document.fonts.ready);

      // Force layout completion
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });
      });

      const screenshotBuffer = await page.screenshot({
        type: outputFormat || 'png',
        fullPage: false,
        omitBackground: false,
      });

      res.set('Content-Type', `image/${outputFormat || 'png'}`);
      res.send(screenshotBuffer);
    } finally {
      await page.close();
    }
  } catch (err) {
    logger.error('Render failed', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Rendering failed', details: err instanceof Error ? err.message : String(err) });
  }
});

// Screenshot URL endpoint with optional login
app.post('/api/v1/render/screenshot', async (req, res) => {
  try {
    const { url, width, height, waitFor, login } = req.body as {
      url: string;
      width?: number;
      height?: number;
      waitFor?: number;
      login?: { loginUrl: string; email: string; password: string };
    };

    if (!url) {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      const renderWidth = width || RENDER_CONFIG.viewportWidth;
      const renderHeight = height || RENDER_CONFIG.viewportHeight;

      await page.setViewport({
        width: renderWidth,
        height: renderHeight,
        deviceScaleFactor: 1,
      });

      // If login credentials provided, login via API and inject token into localStorage
      if (login) {
        // First navigate to the base URL to set localStorage on the correct origin
        const baseUrl = url.replace(/\/[^/]*$/, '/');
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Login via API
        try {
          const response = await fetch('http://rasid-gateway/api/v1/governance/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: login.email, password: login.password }),
          });
          const data = await response.json() as { data?: { accessToken?: string; refreshToken?: string; user?: Record<string, unknown> } };

          if (data.data?.accessToken) {
            await page.evaluate((tokenData: { token: string; refreshToken: string; user: string }) => {
              localStorage.setItem('rasid_token', tokenData.token);
              localStorage.setItem('rasid_refresh_token', tokenData.refreshToken);
              localStorage.setItem('rasid_user', tokenData.user);
            }, {
              token: data.data.accessToken,
              refreshToken: data.data.refreshToken || '',
              user: JSON.stringify(data.data.user || { id: 'admin', email: 'admin', role: 'SUPER_ADMIN', name: 'admin' }),
            });
            logger.info('Auth token injected into localStorage');
          }
        } catch (err) {
          logger.warn('API login failed, trying form login', { error: err instanceof Error ? err.message : String(err) });
        }
      }

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Wait for content to load
      const totalWait = waitFor || 3000;
      await new Promise(resolve => setTimeout(resolve, totalWait));

      const screenshotBuffer = await page.screenshot({
        type: 'png',
        fullPage: false,
      });

      res.set('Content-Type', 'image/png');
      res.send(screenshotBuffer);
    } finally {
      await page.close();
    }
  } catch (err) {
    logger.error('Screenshot failed', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Screenshot failed', details: err instanceof Error ? err.message : String(err) });
  }
});

// Pixel comparison endpoint
app.post('/api/v1/render/compare', async (req, res) => {
  try {
    const { source, generated, threshold } = req.body as {
      source: string;
      generated: string;
      threshold: number;
    };

    const sourceBuffer = Buffer.from(source, 'base64');
    const generatedBuffer = Buffer.from(generated, 'base64');

    const sourceMeta = await sharp(sourceBuffer).metadata();
    const w = sourceMeta.width || RENDER_CONFIG.viewportWidth;
    const h = sourceMeta.height || RENDER_CONFIG.viewportHeight;

    const [srcRaw, genRaw] = await Promise.all([
      sharp(sourceBuffer).ensureAlpha().resize(w, h).raw().toBuffer(),
      sharp(generatedBuffer).ensureAlpha().resize(w, h).raw().toBuffer(),
    ]);

    const diffBuffer = Buffer.alloc(w * h * 4);
    const diffCount = pixelmatch(srcRaw, genRaw, diffBuffer, w, h, {
      threshold: threshold ?? 0,
      includeAA: true,
    });

    const diffImage = await sharp(diffBuffer, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer();

    const totalPixels = w * h;

    res.json({
      pixelDiff: diffCount,
      totalPixels,
      diffPercentage: Math.round((diffCount / totalPixels) * 10000) / 100,
      isPerfect: diffCount === 0,
      diffImage: diffImage.toString('base64'),
    });
  } catch (err) {
    logger.error('Comparison failed', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Comparison failed' });
  }
});

// Font listing endpoint
app.get('/api/v1/render/fonts', async (_, res) => {
  try {
    const { execSync } = await import('child_process');
    const fontList = execSync('fc-list --format="%{family[0]}|%{style[0]}|%{file}\n"').toString().trim();
    const entries = fontList.split('\n').filter(Boolean).map((line) => {
      const [family, style, file] = line.split('|');
      return { family: family?.trim(), style: style?.trim(), file: file?.trim() };
    });
    const families = [...new Set(entries.map((e) => e.family).filter(Boolean))].sort();
    res.json({ fonts: families, details: entries, count: families.length });
  } catch {
    res.json({ fonts: [], details: [], count: 0 });
  }
});

// Font validation endpoint — verify required fonts are installed
app.post('/api/v1/render/validate-fonts', async (req, res) => {
  try {
    const { requiredFonts } = req.body as { requiredFonts: string[] };
    const { execSync } = await import('child_process');
    const fontList = execSync('fc-list --format="%{family[0]}\n"').toString().trim();
    const installed = new Set(fontList.split('\n').filter(Boolean).map((f) => f.trim().toLowerCase()));

    const results = requiredFonts.map((font) => ({
      font,
      installed: installed.has(font.toLowerCase()),
    }));

    const allInstalled = results.every((r) => r.installed);
    const missing = results.filter((r) => !r.installed).map((r) => r.font);

    res.json({ allInstalled, results, missing });
  } catch (err) {
    res.status(500).json({ error: 'Font validation failed' });
  }
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    logger.info('Browser closed');
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app.listen(PORT, async () => {
  logger.info(`Rendering environment started on port ${PORT}`, { config: RENDER_CONFIG });
  // Pre-warm browser on startup
  try {
    await getBrowser();
    logger.info('Browser pre-warmed successfully');
  } catch (err) {
    logger.error('Browser pre-warm failed', { error: err instanceof Error ? err.message : String(err) });
  }
});
