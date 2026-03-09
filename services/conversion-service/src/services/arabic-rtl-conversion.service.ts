import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { z } from 'zod';

const prisma = new PrismaClient();

const RtlConversionOptionsSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  enforceRtl: z.boolean().default(true),
  bidirectionalSupport: z.boolean().default(true),
  numberHandling: z.enum(['preserve', 'arabic-indic', 'western']).default('preserve'),
  fontSubstitution: z.boolean().default(true),
  mirrorLayout: z.boolean().default(true),
  preserveTashkeel: z.boolean().default(true),
});

type RtlConversionOptions = z.infer<typeof RtlConversionOptionsSchema>;

interface RtlAnalysis {
  isRtl: boolean;
  arabicPercentage: number;
  hasMixedDirection: boolean;
  hasTashkeel: boolean;
  hasArabicNumbers: boolean;
  dominantDirection: 'rtl' | 'ltr' | 'mixed';
  segments: Array<{
    text: string;
    direction: 'rtl' | 'ltr';
    startIndex: number;
    endIndex: number;
    language: string;
  }>;
  recommendations: string[];
}

interface RtlTransformation {
  originalText: string;
  transformedText: string;
  htmlOutput: string;
  cssDirectives: string[];
  transformations: Array<{
    type: string;
    description: string;
    count: number;
  }>;
  analysis: RtlAnalysis;
  jobId: string;
  processingTimeMs: number;
}

interface FontMapping {
  source: string;
  replacement: string;
  arabicSupport: boolean;
}

const ARABIC_FONT_REPLACEMENTS: FontMapping[] = [
  { source: 'Times New Roman', replacement: 'Traditional Arabic', arabicSupport: true },
  { source: 'Helvetica', replacement: 'Arial', arabicSupport: true },
  { source: 'Courier', replacement: 'Courier New', arabicSupport: true },
  { source: 'Georgia', replacement: 'Simplified Arabic', arabicSupport: true },
  { source: 'Verdana', replacement: 'Tahoma', arabicSupport: true },
  { source: 'Calibri', replacement: 'Calibri', arabicSupport: true },
  { source: 'Arial', replacement: 'Arial', arabicSupport: true },
  { source: 'Segoe UI', replacement: 'Segoe UI', arabicSupport: true },
];

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '0': '\u0660', '1': '\u0661', '2': '\u0662', '3': '\u0663', '4': '\u0664',
  '5': '\u0665', '6': '\u0666', '7': '\u0667', '8': '\u0668', '9': '\u0669',
};

const WESTERN_DIGITS: Record<string, string> = {
  '\u0660': '0', '\u0661': '1', '\u0662': '2', '\u0663': '3', '\u0664': '4',
  '\u0665': '5', '\u0666': '6', '\u0667': '7', '\u0668': '8', '\u0669': '9',
};

export class ArabicRtlConversionService {

  async analyzeText(text: string): Promise<RtlAnalysis> {
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
    const tashkeelPattern = /[\u064B-\u065F\u0670]/g;
    const arabicIndicDigits = /[\u0660-\u0669]/g;
    const latinPattern = /[a-zA-Z]/g;

    const arabicMatches = text.match(arabicPattern) || [];
    const tashkeelMatches = text.match(tashkeelPattern) || [];
    const arabicDigitMatches = text.match(arabicIndicDigits) || [];
    const latinMatches = text.match(latinPattern) || [];

    const totalChars = text.replace(/[\s\d\p{P}]/gu, '').length;
    const arabicCount = arabicMatches.length - tashkeelMatches.length;
    const latinCount = latinMatches.length;

    const arabicPercentage = totalChars > 0
      ? Math.round((arabicCount / totalChars) * 10000) / 100
      : 0;

    const isRtl = arabicPercentage > 30;
    const hasMixedDirection = arabicCount > 0 && latinCount > 0;
    const hasTashkeel = tashkeelMatches.length > 0;
    const hasArabicNumbers = arabicDigitMatches.length > 0;

    let dominantDirection: 'rtl' | 'ltr' | 'mixed';
    if (arabicPercentage > 60) {
      dominantDirection = 'rtl';
    } else if (arabicPercentage < 20) {
      dominantDirection = 'ltr';
    } else {
      dominantDirection = 'mixed';
    }

    const segments = this.segmentBidirectionalText(text);

    const recommendations: string[] = [];
    if (isRtl) {
      recommendations.push('Set document direction to RTL (dir="rtl")');
      recommendations.push('Use Arabic-compatible fonts (Arial, Tahoma, Simplified Arabic)');
    }
    if (hasMixedDirection) {
      recommendations.push('Apply Unicode Bidirectional Algorithm (UBA) for mixed content');
      recommendations.push('Use <bdi> or Unicode control characters for embedded LTR text');
    }
    if (hasTashkeel) {
      recommendations.push('Preserve tashkeel marks for accuracy');
      recommendations.push('Use fonts that support Arabic diacritics');
    }
    if (hasArabicNumbers) {
      recommendations.push('Decide on number representation: Arabic-Indic vs Western digits');
    }

    return {
      isRtl,
      arabicPercentage,
      hasMixedDirection,
      hasTashkeel,
      hasArabicNumbers,
      dominantDirection,
      segments,
      recommendations,
    };
  }

  async transformForRtl(
    text: string,
    options: Partial<RtlConversionOptions> & { tenantId: string; userId: string }
  ): Promise<RtlTransformation> {
    const startTime = Date.now();
    const validated = RtlConversionOptionsSchema.parse(options);

    logger.info('Starting RTL transformation', {
      tenantId: validated.tenantId,
      textLength: text.length,
      options: {
        enforceRtl: validated.enforceRtl,
        numberHandling: validated.numberHandling,
        mirrorLayout: validated.mirrorLayout,
      },
    });

    const analysis = await this.analyzeText(text);
    let transformedText = text;
    const transformations: RtlTransformation['transformations'] = [];

    if (validated.numberHandling === 'arabic-indic') {
      const originalLength = transformedText.length;
      transformedText = this.convertToArabicIndicDigits(transformedText);
      const changedDigits = this.countDigitChanges(text, transformedText);
      if (changedDigits > 0) {
        transformations.push({
          type: 'number-conversion',
          description: 'Converted Western digits to Arabic-Indic digits',
          count: changedDigits,
        });
      }
    } else if (validated.numberHandling === 'western') {
      transformedText = this.convertToWesternDigits(transformedText);
      const changedDigits = this.countDigitChanges(text, transformedText);
      if (changedDigits > 0) {
        transformations.push({
          type: 'number-conversion',
          description: 'Converted Arabic-Indic digits to Western digits',
          count: changedDigits,
        });
      }
    }

    if (!validated.preserveTashkeel && analysis.hasTashkeel) {
      const stripped = this.stripTashkeel(transformedText);
      const tashkeelCount = transformedText.length - stripped.length;
      transformedText = stripped;
      if (tashkeelCount > 0) {
        transformations.push({
          type: 'tashkeel-removal',
          description: 'Removed tashkeel (diacritical marks)',
          count: tashkeelCount,
        });
      }
    }

    if (validated.bidirectionalSupport && analysis.hasMixedDirection) {
      transformedText = this.insertBidiMarkers(transformedText, analysis);
      transformations.push({
        type: 'bidi-markers',
        description: 'Inserted Unicode bidirectional markers for mixed-direction text',
        count: analysis.segments.filter(s => s.direction === 'ltr').length,
      });
    }

    const cssDirectives = this.generateCssDirectives(analysis, validated);
    const htmlOutput = this.generateHtmlOutput(transformedText, analysis, validated);

    const processingTimeMs = Date.now() - startTime;

    const job = await prisma.conversionJob.create({
      data: {
        tenantId: validated.tenantId,
        userId: validated.userId,
        sourceFormat: 'TEXT',
        targetFormat: 'RTL_TEXT',
        sourceFilename: 'input.txt',
        outputFilename: 'rtl-output.html',
        sourceSizeBytes: Buffer.byteLength(text, 'utf-8'),
        outputSizeBytes: Buffer.byteLength(htmlOutput, 'utf-8'),
        status: 'COMPLETED',
        durationMs: processingTimeMs,
        metadata: JSON.stringify({
          arabicPercentage: analysis.arabicPercentage,
          dominantDirection: analysis.dominantDirection,
          transformationsApplied: transformations.length,
        }),
      },
    });

    logger.info('RTL transformation completed', {
      jobId: job.id,
      arabicPercentage: analysis.arabicPercentage,
      transformations: transformations.length,
      processingTimeMs,
    });

    return {
      originalText: text,
      transformedText,
      htmlOutput,
      cssDirectives,
      transformations,
      analysis,
      jobId: job.id,
      processingTimeMs,
    };
  }

  async transformHtmlForRtl(
    html: string,
    options: Partial<RtlConversionOptions> & { tenantId: string; userId: string }
  ): Promise<{ html: string; jobId: string; transformations: string[] }> {
    const startTime = Date.now();
    const validated = RtlConversionOptionsSchema.parse(options);
    const transformations: string[] = [];

    logger.info('Starting HTML RTL transformation', { tenantId: validated.tenantId, htmlLength: html.length });

    let result = html;

    if (validated.enforceRtl) {
      result = result.replace(/<html([^>]*)>/i, (match, attrs) => {
        if (attrs.includes('dir=')) {
          return match.replace(/dir="[^"]*"/, 'dir="rtl"');
        }
        return `<html${attrs} dir="rtl">`;
      });
      transformations.push('Set html dir="rtl"');

      result = result.replace(/<body([^>]*)>/i, (match, attrs) => {
        if (attrs.includes('dir=')) {
          return match.replace(/dir="[^"]*"/, 'dir="rtl"');
        }
        return `<body${attrs} dir="rtl">`;
      });
      transformations.push('Set body dir="rtl"');
    }

    if (validated.fontSubstitution) {
      for (const mapping of ARABIC_FONT_REPLACEMENTS) {
        if (mapping.source !== mapping.replacement) {
          const fontRegex = new RegExp(`font-family:\\s*['"]?${mapping.source}['"]?`, 'gi');
          if (fontRegex.test(result)) {
            result = result.replace(fontRegex, `font-family: '${mapping.replacement}', '${mapping.source}'`);
            transformations.push(`Substituted font: ${mapping.source} -> ${mapping.replacement}`);
          }
        }
      }
    }

    if (validated.mirrorLayout) {
      result = result.replace(/text-align:\s*left/gi, 'text-align: right');
      result = result.replace(/float:\s*left/gi, 'float: right');
      result = result.replace(/margin-left:\s*(\d+)/gi, 'margin-right: $1');
      result = result.replace(/padding-left:\s*(\d+)/gi, 'padding-right: $1');
      result = result.replace(/border-left:/gi, 'border-right:');
      transformations.push('Mirrored CSS layout properties for RTL');
    }

    const rtlCss = `
  /* RASID RTL Conversion */
  * { direction: rtl; unicode-bidi: embed; }
  body { text-align: right; font-family: 'Arial', 'Tahoma', 'Simplified Arabic', sans-serif; }
  table { direction: rtl; }
  th, td { text-align: right; }
  ol, ul { padding-right: 2em; padding-left: 0; }
  input, textarea, select { direction: rtl; text-align: right; }
  .ltr-content { direction: ltr; unicode-bidi: embed; text-align: left; }
`;

    if (result.includes('</head>')) {
      result = result.replace('</head>', `<style>${rtlCss}</style>\n</head>`);
      transformations.push('Injected RTL CSS directives');
    }

    if (validated.numberHandling === 'arabic-indic') {
      const textPortions = result.replace(/<[^>]*>/g, '\0').split('\0');
      for (const portion of textPortions) {
        if (portion.trim().length > 0) {
          const converted = this.convertToArabicIndicDigits(portion);
          if (converted !== portion) {
            result = result.replace(portion, converted);
          }
        }
      }
      transformations.push('Converted digits to Arabic-Indic');
    }

    const job = await prisma.conversionJob.create({
      data: {
        tenantId: validated.tenantId,
        userId: validated.userId,
        sourceFormat: 'HTML',
        targetFormat: 'HTML_RTL',
        sourceFilename: 'input.html',
        outputFilename: 'rtl-output.html',
        sourceSizeBytes: Buffer.byteLength(html, 'utf-8'),
        outputSizeBytes: Buffer.byteLength(result, 'utf-8'),
        status: 'COMPLETED',
        durationMs: Date.now() - startTime,
        metadata: JSON.stringify({ transformationsApplied: transformations.length }),
      },
    });

    logger.info('HTML RTL transformation completed', {
      jobId: job.id,
      transformations: transformations.length,
      duration: Date.now() - startTime,
    });

    return { html: result, jobId: job.id, transformations };
  }

  getArabicFontReplacements(): FontMapping[] {
    return [...ARABIC_FONT_REPLACEMENTS];
  }

  private segmentBidirectionalText(
    text: string
  ): RtlAnalysis['segments'] {
    const segments: RtlAnalysis['segments'] = [];
    const arabicRange = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const latinRange = /[a-zA-Z]/;

    let currentSegment = '';
    let currentDirection: 'rtl' | 'ltr' | null = null;
    let startIndex = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      let charDirection: 'rtl' | 'ltr' | null = null;

      if (arabicRange.test(char)) {
        charDirection = 'rtl';
      } else if (latinRange.test(char)) {
        charDirection = 'ltr';
      }

      if (charDirection !== null && charDirection !== currentDirection) {
        if (currentSegment.trim().length > 0 && currentDirection !== null) {
          segments.push({
            text: currentSegment,
            direction: currentDirection,
            startIndex,
            endIndex: i,
            language: currentDirection === 'rtl' ? 'ar' : 'en',
          });
        }
        currentSegment = char;
        currentDirection = charDirection;
        startIndex = i;
      } else {
        currentSegment += char;
      }
    }

    if (currentSegment.trim().length > 0 && currentDirection !== null) {
      segments.push({
        text: currentSegment,
        direction: currentDirection,
        startIndex,
        endIndex: text.length,
        language: currentDirection === 'rtl' ? 'ar' : 'en',
      });
    }

    return segments;
  }

  private convertToArabicIndicDigits(text: string): string {
    return text.replace(/[0-9]/g, (digit) => ARABIC_INDIC_DIGITS[digit] || digit);
  }

  private convertToWesternDigits(text: string): string {
    return text.replace(/[\u0660-\u0669]/g, (digit) => WESTERN_DIGITS[digit] || digit);
  }

  private stripTashkeel(text: string): string {
    return text.replace(/[\u064B-\u065F\u0670]/g, '');
  }

  private countDigitChanges(original: string, transformed: string): number {
    let count = 0;
    for (let i = 0; i < Math.min(original.length, transformed.length); i++) {
      if (original[i] !== transformed[i]) count++;
    }
    return count;
  }

  private insertBidiMarkers(text: string, analysis: RtlAnalysis): string {
    const RLM = '\u200F';
    const LRM = '\u200E';
    let result = '';

    for (const segment of analysis.segments) {
      if (segment.direction === 'ltr' && analysis.dominantDirection === 'rtl') {
        result += LRM + segment.text + RLM;
      } else if (segment.direction === 'rtl' && analysis.dominantDirection === 'ltr') {
        result += RLM + segment.text + LRM;
      } else {
        result += segment.text;
      }
    }

    return result || text;
  }

  private generateCssDirectives(
    analysis: RtlAnalysis,
    options: RtlConversionOptions
  ): string[] {
    const directives: string[] = [];

    if (analysis.isRtl || options.enforceRtl) {
      directives.push('direction: rtl;');
      directives.push('unicode-bidi: embed;');
      directives.push('text-align: right;');
    }

    directives.push("font-family: 'Arial', 'Tahoma', 'Simplified Arabic', sans-serif;");

    if (options.mirrorLayout) {
      directives.push('/* Layout mirroring for RTL */');
      directives.push('margin-left: auto; margin-right: 0;');
    }

    if (analysis.hasMixedDirection) {
      directives.push('/* Bidirectional text support */');
      directives.push('.ltr-embed { direction: ltr; unicode-bidi: embed; }');
      directives.push('.rtl-embed { direction: rtl; unicode-bidi: embed; }');
    }

    return directives;
  }

  private generateHtmlOutput(
    text: string,
    analysis: RtlAnalysis,
    options: RtlConversionOptions
  ): string {
    const dir = analysis.isRtl || options.enforceRtl ? 'rtl' : 'ltr';
    const lang = analysis.isRtl ? 'ar' : 'en';

    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
    const bodyContent = paragraphs
      .map(p => {
        const lines = p.split('\n').filter(l => l.trim().length > 0);
        return `    <p>${lines.join('<br>')}</p>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="RASID Arabic RTL Conversion Service">
  <style>
    * { box-sizing: border-box; }
    body {
      direction: ${dir};
      text-align: ${dir === 'rtl' ? 'right' : 'left'};
      font-family: 'Arial', 'Tahoma', 'Simplified Arabic', sans-serif;
      font-size: 16px;
      line-height: 1.8;
      color: #1a1a2e;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      background: #ffffff;
    }
    p { margin-bottom: 16px; }
    .bidi-ltr { direction: ltr; unicode-bidi: embed; display: inline; }
    .bidi-rtl { direction: rtl; unicode-bidi: embed; display: inline; }
    table { direction: ${dir}; width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { text-align: ${dir === 'rtl' ? 'right' : 'left'}; padding: 8px 12px; border: 1px solid #ddd; }
    th { background: #4472C4; color: white; }
    ul, ol { padding-${dir === 'rtl' ? 'right' : 'left'}: 2em; padding-${dir === 'rtl' ? 'left' : 'right'}: 0; }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
  }
}

export const arabicRtlConversionService = new ArabicRtlConversionService();
