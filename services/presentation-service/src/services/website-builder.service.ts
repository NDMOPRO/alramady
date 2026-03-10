import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger, format, transports } from 'winston';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const prisma = new PrismaClient();

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'website-builder' },
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});

interface WebsiteConfig {
  theme?: 'modern' | 'corporate' | 'minimal' | 'arabic' | 'dark';
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  includeNavigation?: boolean;
  includeFooter?: boolean;
  responsiveBreakpoints?: boolean;
  seoOptimize?: boolean;
  language?: 'ar' | 'en';
}

interface WebsiteResult {
  id: string;
  presentationId: string;
  tenantId: string;
  outputDir: string;
  pages: Array<{ filename: string; title: string; slideIndex: number }>;
  totalFiles: number;
  totalSize: number;
  previewHtml: string;
  createdAt: string;
}

interface SEOMetadata {
  title: string;
  description: string;
  keywords: string[];
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonicalUrl: string;
  structuredData: Record<string, unknown>;
}

export class WebsiteBuilderService {
  private readonly outputBase: string;

  constructor() {
    this.outputBase = process.env.WEBSITE_OUTPUT_DIR || '/tmp/rasid/websites';
  }

  async generateWebsite(
    presentationId: string,
    config: WebsiteConfig,
    tenantId: string,
    userId: string,
  ): Promise<WebsiteResult> {
    const websiteId = randomUUID();
    const outputDir = path.join(this.outputBase, websiteId);
    await fs.mkdir(path.join(outputDir, 'css'), { recursive: true });
    await fs.mkdir(path.join(outputDir, 'js'), { recursive: true });
    await fs.mkdir(path.join(outputDir, 'images'), { recursive: true });

    logger.info('Generating website from presentation', { websiteId, presentationId });

    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
    });
    if (!presentation) throw new Error(`Presentation ${presentationId} not found`);

    const slidesData = (presentation.slides ?? (presentation as any).data) as Array<Record<string, unknown>>;
    if (!slidesData) throw new Error('No slides data');

    const lang = config.language || 'ar';
    const isRtl = lang === 'ar';
    const theme = this.getTheme(config);

    const css = this.generateCSS(theme, isRtl, config);
    await fs.writeFile(path.join(outputDir, 'css', 'style.css'), css, 'utf-8');

    const js = this.generateJS(slidesData.length, config);
    await fs.writeFile(path.join(outputDir, 'js', 'main.js'), js, 'utf-8');

    const pages: Array<{ filename: string; title: string; slideIndex: number }> = [];

    const indexHtml = this.generateIndexPage(slidesData, theme, config, lang);
    await fs.writeFile(path.join(outputDir, 'index.html'), indexHtml, 'utf-8');
    pages.push({ filename: 'index.html', title: (presentation.title as string) || 'Home', slideIndex: -1 });

    for (let i = 0; i < slidesData.length; i++) {
      const slide = slidesData[i];
      const title = (slide.title as string) || `Slide ${i + 1}`;
      const filename = `slide-${i + 1}.html`;
      const slideHtml = this.generateSlidePage(slide, i, slidesData.length, theme, config, lang);
      await fs.writeFile(path.join(outputDir, filename), slideHtml, 'utf-8');
      pages.push({ filename, title, slideIndex: i });
    }

    if (config.seoOptimize) {
      const seo = await this.generateSEOMetadata(presentationId);
      const robotsTxt = `User-agent: *\nAllow: /\nSitemap: /sitemap.xml`;
      await fs.writeFile(path.join(outputDir, 'robots.txt'), robotsTxt, 'utf-8');

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>/${p.filename}</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod></url>`).join('\n')}
</urlset>`;
      await fs.writeFile(path.join(outputDir, 'sitemap.xml'), sitemap, 'utf-8');
    }

    const totalSize = await this.calculateDirSize(outputDir);

    await (prisma as any).auditLog.create({
      data: {
        action: 'website_generated',
        entityType: 'presentation',
        entityId: presentationId,
        userId,
        tenantId,
        details: JSON.stringify({ websiteId, pages: pages.length, totalSize }),
        performedAt: new Date(),
      },
    });

    logger.info('Website generated', { websiteId, pages: pages.length, totalSize });

    return {
      id: websiteId,
      presentationId,
      tenantId,
      outputDir,
      pages,
      totalFiles: pages.length + 3,
      totalSize,
      previewHtml: indexHtml,
      createdAt: new Date().toISOString(),
    };
  }

  async generateLandingPage(presentationId: string, tenantId: string): Promise<string> {
    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
    });
    if (!presentation) throw new Error(`Presentation ${presentationId} not found`);

    const slidesData = (presentation.slides ?? (presentation as any).data) as Array<Record<string, unknown>>;
    const firstSlide = slidesData?.[0];
    if (!firstSlide) throw new Error('No slides');

    const title = (firstSlide.title as string) || (presentation.title as string) || 'Rasid';
    const elements = ((firstSlide.elements as Array<Record<string, unknown>>) || [])
      .filter((e) => e.type === 'text')
      .map((e) => String(e.content || ''));

    const theme = this.getTheme({});

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${this.escapeHtml(title)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ${theme.fontFamily}; background: ${theme.background}; color: ${theme.text}; direction: rtl; }
.hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2rem; background: linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark}); color: #fff; }
.hero h1 { font-size: 3rem; margin-bottom: 1rem; }
.hero p { font-size: 1.25rem; max-width: 600px; opacity: 0.9; margin-bottom: 2rem; }
.cta { padding: 1rem 2rem; background: #fff; color: ${theme.primary}; border: none; border-radius: 8px; font-size: 1.1rem; cursor: pointer; font-weight: bold; }
.cta:hover { opacity: 0.9; }
</style>
</head>
<body>
<section class="hero">
<h1>${this.escapeHtml(title)}</h1>
${elements.map((t) => `<p>${this.escapeHtml(t)}</p>`).join('\n')}
<button class="cta">اكتشف المزيد</button>
</section>
</body>
</html>`;
  }

  async exportStaticSite(websiteId: string): Promise<Buffer> {
    const archiver = (await import('archiver' as any)).default;
    const { createWriteStream } = await import('fs');
    const websiteDir = path.join(this.outputBase, websiteId);

    const zipPath = path.join(this.outputBase, `${websiteId}.zip`);
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        const buffer = await fs.readFile(zipPath);
        try { await fs.unlink(zipPath); } catch { /* ignore */ }
        resolve(buffer);
      });
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(websiteDir, false);
      archive.finalize();
    });
  }

  async generateSEOMetadata(presentationId: string): Promise<SEOMetadata> {
    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
    });
    if (!presentation) throw new Error(`Presentation ${presentationId} not found`);

    const slidesData = (presentation.slides ?? (presentation as any).data) as Array<Record<string, unknown>>;
    const allText = slidesData?.map((s) => {
      const title = (s.title as string) || '';
      const elements = ((s.elements as Array<Record<string, unknown>>) || [])
        .filter((e) => e.type === 'text')
        .map((e) => String(e.content || ''));
      return [title, ...elements].join(' ');
    }).join(' ').substring(0, 2000) || '';

    const prompt = `Generate SEO metadata for a website built from a presentation. Content: "${allText}"

Respond in JSON:
{
  "title": "...",
  "description": "150 char max",
  "keywords": ["keyword1", "keyword2"],
  "ogTitle": "...",
  "ogDescription": "..."
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    const parsed = JSON.parse(content);
    return {
      title: parsed.title || (presentation.title as string) || '',
      description: parsed.description || '',
      keywords: parsed.keywords || [],
      ogTitle: parsed.ogTitle || parsed.title || '',
      ogDescription: parsed.ogDescription || parsed.description || '',
      ogImage: '',
      canonicalUrl: '',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: parsed.title,
        description: parsed.description,
      },
    };
  }

  async listWebsites(tenantId: string): Promise<Array<{ id: string; createdAt: string }>> {
    try {
      const entries = await fs.readdir(this.outputBase, { withFileTypes: true });
      const websites: Array<{ id: string; createdAt: string }> = [];
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.length === 36) {
          const stat = await fs.stat(path.join(this.outputBase, entry.name));
          websites.push({ id: entry.name, createdAt: stat.birthtime.toISOString() });
        }
      }
      return websites.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }

  async getWebsiteList(tenantId: string, page: number = 1, pageSize: number = 20): Promise<{
    websites: Array<{ id: string; presentationId: string; title: string; pageCount: number; createdAt: string }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [records, total] = await Promise.all([
      (prisma as any).generatedWebsite.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (prisma as any).generatedWebsite.count({ where: { tenantId } }),
    ]);

    return {
      websites: records.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        presentationId: String(r.presentationId || ''),
        title: String(r.presentationTitle || r.title || ''),
        pageCount: Number(r.pageCount || 0),
        createdAt: (r.createdAt as Date).toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async previewWebsite(websiteId: string): Promise<string> {
    const websiteDir = path.join(this.outputBase, websiteId);
    try {
      const html = await fs.readFile(path.join(websiteDir, 'index.html'), 'utf-8');
      return html;
    } catch {
      const record = await (prisma as any).generatedWebsite.findUnique({ where: { id: websiteId } });
      if (record && record.html) {
        return record.html as string;
      }
      throw new Error(`Website ${websiteId} not found`);
    }
  }

  async updateWebsiteTheme(websiteId: string, theme: Partial<WebsiteConfig>): Promise<{ id: string; updated: boolean }> {
    const websiteDir = path.join(this.outputBase, websiteId);
    const indexPath = path.join(websiteDir, 'index.html');

    let html: string;
    try {
      html = await fs.readFile(indexPath, 'utf-8');
    } catch {
      throw new Error(`Website ${websiteId} not found on disk`);
    }

    const newTheme = this.getTheme({
      theme: theme.theme,
      primaryColor: theme.primaryColor,
      secondaryColor: theme.secondaryColor,
      fontFamily: theme.fontFamily,
    });

    const isRtl = theme.language === 'en' ? false : true;
    const newCss = this.generateCSS(newTheme, isRtl, theme as WebsiteConfig);

    await fs.writeFile(path.join(websiteDir, 'css', 'style.css'), newCss, 'utf-8');

    logger.info('Website theme updated', { websiteId, theme: theme.theme || 'custom' });

    return { id: websiteId, updated: true };
  }

  private getTheme(config: WebsiteConfig) {
    const themes: Record<string, Record<string, string>> = {
      modern: { primary: '#3498DB', primaryDark: '#2980B9', secondary: '#2ECC71', background: '#FFFFFF', text: '#2C3E50', fontFamily: "'Noto Sans Arabic', 'Segoe UI', sans-serif" },
      corporate: { primary: '#1A365D', primaryDark: '#153050', secondary: '#C53030', background: '#F7FAFC', text: '#1A202C', fontFamily: "'Noto Sans Arabic', 'Georgia', serif" },
      minimal: { primary: '#000000', primaryDark: '#1A1A1A', secondary: '#718096', background: '#FFFFFF', text: '#1A202C', fontFamily: "'Noto Sans Arabic', 'Helvetica Neue', sans-serif" },
      arabic: { primary: '#1B4D3E', primaryDark: '#0F3A2E', secondary: '#C5A55A', background: '#FEFCF6', text: '#2D3436', fontFamily: "'Noto Kufi Arabic', 'Amiri', serif" },
      dark: { primary: '#6C5CE7', primaryDark: '#5A4BD1', secondary: '#00CEC9', background: '#1A1A2E', text: '#E2E8F0', fontFamily: "'Noto Sans Arabic', 'Inter', sans-serif" },
    };
    const base = themes[config.theme || 'modern'];
    if (config.primaryColor) base.primary = config.primaryColor;
    if (config.secondaryColor) base.secondary = config.secondaryColor;
    if (config.fontFamily) base.fontFamily = config.fontFamily;
    return base;
  }

  private generateCSS(theme: Record<string, string>, isRtl: boolean, config: WebsiteConfig): string {
    return `
:root {
  --primary: ${theme.primary};
  --primary-dark: ${theme.primaryDark};
  --secondary: ${theme.secondary};
  --bg: ${theme.background};
  --text: ${theme.text};
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: ${theme.fontFamily}; background: var(--bg); color: var(--text); direction: ${isRtl ? 'rtl' : 'ltr'}; line-height: 1.6; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 2rem; }
nav { position: sticky; top: 0; background: var(--primary); color: #fff; padding: 1rem 0; z-index: 100; }
nav .container { display: flex; justify-content: space-between; align-items: center; }
nav a { color: #fff; text-decoration: none; padding: 0.5rem 1rem; border-radius: 4px; transition: background 0.2s; }
nav a:hover { background: rgba(255,255,255,0.15); }
.slide-section { min-height: 80vh; display: flex; align-items: center; padding: 4rem 0; border-bottom: 1px solid rgba(0,0,0,0.05); }
.slide-section:nth-child(even) { background: rgba(0,0,0,0.02); }
.slide-content { width: 100%; }
.slide-content h2 { font-size: 2.5rem; margin-bottom: 1.5rem; color: var(--primary); }
.slide-content p { font-size: 1.1rem; max-width: 800px; margin-bottom: 1rem; }
footer { background: var(--primary-dark); color: #fff; padding: 2rem 0; text-align: center; }
@media (max-width: 768px) {
  .slide-content h2 { font-size: 1.8rem; }
  .slide-section { min-height: auto; padding: 2rem 0; }
}`;
  }

  private generateJS(slideCount: number, config: WebsiteConfig): string {
    return `
document.addEventListener('DOMContentLoaded', function() {
  // Smooth scroll navigation
  document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      var target = document.querySelector(this.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Intersection Observer for animations
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.slide-section').forEach(function(section) {
    observer.observe(section);
  });
});`;
  }

  private generateIndexPage(
    slides: Array<Record<string, unknown>>,
    theme: Record<string, string>,
    config: WebsiteConfig,
    lang: string,
  ): string {
    const isRtl = lang === 'ar';
    const navLinks = slides.map((s, i) => {
      const title = (s.title as string) || `${isRtl ? 'شريحة' : 'Slide'} ${i + 1}`;
      return `<a href="#slide-${i}">${this.escapeHtml(title)}</a>`;
    }).join('\n');

    const sections = slides.map((slide, i) => {
      const title = (slide.title as string) || `${isRtl ? 'شريحة' : 'Slide'} ${i + 1}`;
      const elements = ((slide.elements as Array<Record<string, unknown>>) || [])
        .filter((e) => e.type === 'text')
        .map((e) => `<p>${this.escapeHtml(String(e.content || ''))}</p>`)
        .join('\n');
      return `<section class="slide-section" id="slide-${i}">
<div class="container slide-content">
<h2>${this.escapeHtml(title)}</h2>
${elements}
</div>
</section>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${isRtl ? 'عرض تقديمي' : 'Presentation'}</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
${config.includeNavigation !== false ? `<nav><div class="container">${navLinks}</div></nav>` : ''}
${sections}
${config.includeFooter !== false ? `<footer><div class="container"><p>&copy; ${new Date().getFullYear()} Rasid Platform</p></div></footer>` : ''}
<script src="js/main.js"></script>
</body>
</html>`;
  }

  private generateSlidePage(
    slide: Record<string, unknown>,
    index: number,
    total: number,
    theme: Record<string, string>,
    config: WebsiteConfig,
    lang: string,
  ): string {
    const isRtl = lang === 'ar';
    const title = (slide.title as string) || `${isRtl ? 'شريحة' : 'Slide'} ${index + 1}`;
    const elements = ((slide.elements as Array<Record<string, unknown>>) || [])
      .filter((e) => e.type === 'text')
      .map((e) => `<p>${this.escapeHtml(String(e.content || ''))}</p>`)
      .join('\n');

    const prevLink = index > 0 ? `<a href="slide-${index}.html">${isRtl ? 'السابق' : 'Previous'}</a>` : '';
    const nextLink = index < total - 1 ? `<a href="slide-${index + 2}.html">${isRtl ? 'التالي' : 'Next'}</a>` : '';

    return `<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${this.escapeHtml(title)}</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<nav><div class="container"><a href="index.html">${isRtl ? 'الرئيسية' : 'Home'}</a> ${prevLink} ${nextLink}</div></nav>
<section class="slide-section">
<div class="container slide-content">
<h2>${this.escapeHtml(title)}</h2>
${elements}
</div>
</section>
<script src="js/main.js"></script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  private async calculateDirSize(dirPath: string): Promise<number> {
    let total = 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        total += (await fs.stat(fullPath)).size;
      } else if (entry.isDirectory()) {
        total += await this.calculateDirSize(fullPath);
      }
    }
    return total;
  }
}

export const websiteBuilderService = new WebsiteBuilderService();
