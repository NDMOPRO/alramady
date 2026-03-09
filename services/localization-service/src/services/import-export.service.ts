import { PrismaClient, Language } from '@prisma/client';
import * as crypto from 'crypto';
import * as path from 'path';

// ─── Interfaces ──────────────────────────────────────────────────────
interface TranslationUnit {
  id: string;
  source: string;
  target: string;
  sourceLanguage: string;
  targetLanguage: string;
  context?: string;
  notes?: string;
  state: 'new' | 'translated' | 'reviewed' | 'final';
  maxWidth?: number;
  preserveWhitespace?: boolean;
}

interface ImportResult {
  success: boolean;
  format: string;
  totalUnits: number;
  importedUnits: number;
  skippedUnits: number;
  failedUnits: number;
  warnings: string[];
  errors: string[];
  duration: number;
}

interface ExportResult {
  success: boolean;
  format: string;
  content: string | Buffer;
  filename: string;
  mimeType: string;
  totalUnits: number;
  duration: number;
}

interface XliffDocument {
  version: '1.2' | '2.0';
  sourceLanguage: string;
  targetLanguage: string;
  files: XliffFile[];
}

interface XliffFile {
  original: string;
  datatype: string;
  units: TranslationUnit[];
}

interface POEntry {
  msgid: string;
  msgstr: string;
  msgctxt?: string;
  comments?: string[];
  flags?: string[];
  references?: string[];
}

interface TMXEntry {
  tuid: string;
  sourceLanguage: string;
  targetLanguage: string;
  source: string;
  target: string;
  creationDate?: Date;
  changeDate?: Date;
  createdBy?: string;
  metadata?: Record<string, string>;
}

interface LocalizationFileConfig {
  projectId: string;
  sourceLanguage: string;
  targetLanguages: string[];
  namespace?: string;
  includeEmpty: boolean;
  flattenKeys: boolean;
  sortKeys: boolean;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class ImportExportService {
  private prisma: PrismaClient;
  private unitCache: Map<string, TranslationUnit[]> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async importXliff(content: string, projectId: string): Promise<ImportResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];
    let importedUnits = 0;
    let skippedUnits = 0;
    let failedUnits = 0;

    const doc = this.parseXliff(content);
    if (!doc) {
      return {
        success: false,
        format: 'xliff',
        totalUnits: 0,
        importedUnits: 0,
        skippedUnits: 0,
        failedUnits: 0,
        warnings,
        errors: ['Failed to parse XLIFF document'],
        duration: Date.now() - startTime,
      };
    }

    const totalUnits = doc.files.reduce((sum, f) => sum + f.units.length, 0);

    for (const file of doc.files) {
      for (const unit of file.units) {
        try {
          if (!unit.source || unit.source.trim().length === 0) {
            skippedUnits++;
            warnings.push(`Skipped unit ${unit.id}: empty source text`);
            continue;
          }

          await this.prisma.translationUnit.upsert({
            where: {
              projectId_sourceLanguage_targetLanguage_sourceText: {
                projectId,
                sourceLanguage: doc.sourceLanguage,
                targetLanguage: doc.targetLanguage,
                sourceText: unit.source,
              },
            },
            update: {
              targetText: unit.target || '',
              state: unit.state,
              context: unit.context,
              notes: unit.notes,
              updatedAt: new Date(),
            },
            create: {
              id: unit.id || crypto.randomUUID(),
              projectId,
              sourceLanguage: doc.sourceLanguage,
              targetLanguage: doc.targetLanguage,
              sourceText: unit.source,
              targetText: unit.target || '',
              state: unit.state || 'new',
              context: unit.context,
              notes: unit.notes,
              fileOrigin: file.original,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });

          importedUnits++;
        } catch (error) {
          failedUnits++;
          const errMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to import unit ${unit.id}: ${errMsg}`);
        }
      }
    }

    this.unitCache.delete(projectId);

    return {
      success: failedUnits === 0,
      format: 'xliff',
      totalUnits,
      importedUnits,
      skippedUnits,
      failedUnits,
      warnings,
      errors,
      duration: Date.now() - startTime,
    };
  }

  private parseXliff(content: string): XliffDocument | null {
    try {
      const isV2 = content.includes('xmlns="urn:oasis:names:tc:xliff:document:2.0"');
      const version = isV2 ? '2.0' : '1.2';

      const srcLangMatch = content.match(isV2
        ? /srcLang="([^"]+)"/
        : /source-language="([^"]+)"/);
      const tgtLangMatch = content.match(isV2
        ? /trgLang="([^"]+)"/
        : /target-language="([^"]+)"/);

      const sourceLanguage = srcLangMatch ? srcLangMatch[1] : 'en';
      const targetLanguage = tgtLangMatch ? tgtLangMatch[1] : 'ar';

      const files: XliffFile[] = [];
      const fileRegex = isV2
        ? /<file[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/file>/g
        : /<file[^>]*original="([^"]*)"[^>]*>([\s\S]*?)<\/file>/g;

      let fileMatch: RegExpExecArray | null;
      while ((fileMatch = fileRegex.exec(content)) !== null) {
        const fileId = fileMatch[1];
        const fileContent = fileMatch[2];
        const units: TranslationUnit[] = [];

        const unitRegex = isV2
          ? /<unit[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/unit>/g
          : /<trans-unit[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/trans-unit>/g;

        let unitMatch: RegExpExecArray | null;
        while ((unitMatch = unitRegex.exec(fileContent)) !== null) {
          const unitId = unitMatch[1];
          const unitContent = unitMatch[2];

          const sourceMatch = unitContent.match(/<source[^>]*>([\s\S]*?)<\/source>/);
          const targetMatch = unitContent.match(/<target[^>]*>([\s\S]*?)<\/target>/);
          const noteMatch = unitContent.match(/<note[^>]*>([\s\S]*?)<\/note>/);
          const stateMatch = unitContent.match(/state="([^"]*)"/);

          const source = sourceMatch ? this.decodeXmlEntities(sourceMatch[1].trim()) : '';
          const target = targetMatch ? this.decodeXmlEntities(targetMatch[1].trim()) : '';

          let state: TranslationUnit['state'] = 'new';
          if (stateMatch) {
            const stateVal = stateMatch[1].toLowerCase();
            if (stateVal === 'translated' || stateVal === 'signed-off') state = 'translated';
            else if (stateVal === 'reviewed') state = 'reviewed';
            else if (stateVal === 'final') state = 'final';
          }

          units.push({
            id: unitId,
            source,
            target,
            sourceLanguage,
            targetLanguage,
            notes: noteMatch ? noteMatch[1].trim() : undefined,
            state,
          });
        }

        files.push({ original: fileId, datatype: 'plaintext', units });
      }

      if (files.length === 0) {
        const units = this.parseXliffUnitsFlat(content, isV2, sourceLanguage, targetLanguage);
        if (units.length > 0) {
          files.push({ original: 'default', datatype: 'plaintext', units });
        }
      }

      return { version, sourceLanguage, targetLanguage, files };
    } catch {
      return null;
    }
  }

  private parseXliffUnitsFlat(
    content: string,
    isV2: boolean,
    sourceLanguage: string,
    targetLanguage: string,
  ): TranslationUnit[] {
    const units: TranslationUnit[] = [];
    const unitRegex = isV2
      ? /<unit[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/unit>/g
      : /<trans-unit[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/trans-unit>/g;

    let match: RegExpExecArray | null;
    while ((match = unitRegex.exec(content)) !== null) {
      const unitId = match[1];
      const unitContent = match[2];
      const sourceMatch = unitContent.match(/<source[^>]*>([\s\S]*?)<\/source>/);
      const targetMatch = unitContent.match(/<target[^>]*>([\s\S]*?)<\/target>/);

      units.push({
        id: unitId,
        source: sourceMatch ? this.decodeXmlEntities(sourceMatch[1].trim()) : '',
        target: targetMatch ? this.decodeXmlEntities(targetMatch[1].trim()) : '',
        sourceLanguage,
        targetLanguage,
        state: 'new',
      });
    }

    return units;
  }

  async exportXliff(
    projectId: string,
    targetLanguage: string,
    version: '1.2' | '2.0' = '2.0',
  ): Promise<ExportResult> {
    const startTime = Date.now();

    const units = await this.prisma.translationUnit.findMany({
      where: { projectId, targetLanguage },
      orderBy: { createdAt: 'asc' },
    });

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, sourceLanguage: true },
    });

    const sourceLanguage = project?.sourceLanguage || 'en';
    let xmlContent: string;

    if (version === '2.0') {
      xmlContent = this.generateXliff2(units, sourceLanguage, targetLanguage, project?.name || 'project');
    } else {
      xmlContent = this.generateXliff12(units, sourceLanguage, targetLanguage, project?.name || 'project');
    }

    return {
      success: true,
      format: 'xliff',
      content: xmlContent,
      filename: `${projectId}_${targetLanguage}.xlf`,
      mimeType: 'application/xliff+xml',
      totalUnits: units.length,
      duration: Date.now() - startTime,
    };
  }

  private generateXliff2(
    units: Array<{ id: string; notes?: string | null; context?: string | null; sourceText: string; targetText?: string | null; state: string }>,
    sourceLanguage: string,
    targetLanguage: string,
    projectName: string,
  ): string {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="${sourceLanguage}" trgLang="${targetLanguage}">`);
    lines.push(`  <file id="${projectName}">`);

    for (const unit of units) {
      lines.push(`    <unit id="${this.escapeXml(unit.id)}">`);
      if (unit.notes) {
        lines.push(`      <notes><note>${this.escapeXml(unit.notes)}</note></notes>`);
      }
      lines.push('      <segment>');
      lines.push(`        <source>${this.escapeXml(unit.sourceText)}</source>`);
      lines.push(`        <target state="${unit.state}">${this.escapeXml(unit.targetText || '')}</target>`);
      lines.push('      </segment>');
      lines.push('    </unit>');
    }

    lines.push('  </file>');
    lines.push('</xliff>');
    return lines.join('\n');
  }

  private generateXliff12(
    units: Array<{ id: string; notes?: string | null; context?: string | null; sourceText: string; targetText?: string | null; state: string }>,
    sourceLanguage: string,
    targetLanguage: string,
    projectName: string,
  ): string {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">');
    lines.push(`  <file original="${projectName}" source-language="${sourceLanguage}" target-language="${targetLanguage}" datatype="plaintext">`);
    lines.push('    <body>');

    for (const unit of units) {
      const stateAttr = unit.state !== 'new' ? ` state="${unit.state}"` : '';
      lines.push(`      <trans-unit id="${this.escapeXml(unit.id)}"${stateAttr}>`);
      lines.push(`        <source>${this.escapeXml(unit.sourceText)}</source>`);
      lines.push(`        <target>${this.escapeXml(unit.targetText || '')}</target>`);
      if (unit.notes) {
        lines.push(`        <note>${this.escapeXml(unit.notes)}</note>`);
      }
      if (unit.context) {
        lines.push(`        <context-group><context context-type="x-context">${this.escapeXml(unit.context)}</context></context-group>`);
      }
      lines.push('      </trans-unit>');
    }

    lines.push('    </body>');
    lines.push('  </file>');
    lines.push('</xliff>');
    return lines.join('\n');
  }

  async importPO(content: string, projectId: string, targetLanguage: string): Promise<ImportResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];
    let importedUnits = 0;
    let skippedUnits = 0;
    let failedUnits = 0;

    const entries = this.parsePOFile(content);

    for (const entry of entries) {
      if (!entry.msgid || entry.msgid.trim().length === 0) {
        skippedUnits++;
        continue;
      }

      try {
        const sourceLanguage = 'en';
        await this.prisma.translationUnit.upsert({
          where: {
            projectId_sourceLanguage_targetLanguage_sourceText: {
              projectId,
              sourceLanguage,
              targetLanguage,
              sourceText: entry.msgid,
            },
          },
          update: {
            targetText: entry.msgstr,
            context: entry.msgctxt,
            notes: entry.comments?.join('\n'),
            state: entry.msgstr ? 'translated' : 'new',
            updatedAt: new Date(),
          },
          create: {
            id: crypto.randomUUID(),
            projectId,
            sourceLanguage,
            targetLanguage,
            sourceText: entry.msgid,
            targetText: entry.msgstr,
            context: entry.msgctxt,
            notes: entry.comments?.join('\n'),
            state: entry.msgstr ? 'translated' : 'new',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        importedUnits++;
      } catch (error) {
        failedUnits++;
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to import entry "${entry.msgid.substring(0, 50)}": ${errMsg}`);
      }
    }

    return {
      success: failedUnits === 0,
      format: 'po',
      totalUnits: entries.length,
      importedUnits,
      skippedUnits,
      failedUnits,
      warnings,
      errors,
      duration: Date.now() - startTime,
    };
  }

  private parsePOFile(content: string): POEntry[] {
    const entries: POEntry[] = [];
    const blocks = content.split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.split('\n').filter(l => l.trim().length > 0);
      if (lines.length === 0) continue;

      const entry: POEntry = { msgid: '', msgstr: '', comments: [], flags: [], references: [] };
      let currentField: 'msgid' | 'msgstr' | 'msgctxt' | null = null;

      for (const line of lines) {
        if (line.startsWith('#. ')) {
          entry.comments!.push(line.substring(3));
        } else if (line.startsWith('#: ')) {
          entry.references!.push(line.substring(3));
        } else if (line.startsWith('#, ')) {
          entry.flags!.push(...line.substring(3).split(',').map(f => f.trim()));
        } else if (line.startsWith('#')) {
          entry.comments!.push(line.substring(1).trim());
        } else if (line.startsWith('msgctxt ')) {
          currentField = 'msgctxt';
          entry.msgctxt = this.extractPOString(line.substring(8));
        } else if (line.startsWith('msgid ')) {
          currentField = 'msgid';
          entry.msgid = this.extractPOString(line.substring(6));
        } else if (line.startsWith('msgstr ')) {
          currentField = 'msgstr';
          entry.msgstr = this.extractPOString(line.substring(7));
        } else if (line.startsWith('"') && currentField) {
          const continuation = this.extractPOString(line);
          if (currentField === 'msgid') entry.msgid += continuation;
          else if (currentField === 'msgstr') entry.msgstr += continuation;
          else if (currentField === 'msgctxt') entry.msgctxt = (entry.msgctxt || '') + continuation;
        }
      }

      if (entry.msgid.length > 0) {
        entries.push(entry);
      }
    }

    return entries;
  }

  private extractPOString(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return trimmed;
  }

  async exportPO(projectId: string, targetLanguage: string): Promise<ExportResult> {
    const startTime = Date.now();

    const units = await this.prisma.translationUnit.findMany({
      where: { projectId, targetLanguage },
      orderBy: { createdAt: 'asc' },
    });

    const lines: string[] = [];
    lines.push('# PO file generated by Rasid Localization Service');
    lines.push(`# Language: ${targetLanguage}`);
    lines.push(`# Project: ${projectId}`);
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('msgid ""');
    lines.push('msgstr ""');
    lines.push(`"Content-Type: text/plain; charset=UTF-8\\n"`);
    lines.push(`"Language: ${targetLanguage}\\n"`);
    lines.push(`"MIME-Version: 1.0\\n"`);
    lines.push(`"Content-Transfer-Encoding: 8bit\\n"`);
    lines.push('');

    for (const unit of units) {
      if (unit.notes) {
        for (const line of unit.notes.split('\n')) {
          lines.push(`#. ${line}`);
        }
      }
      if (unit.context) {
        lines.push(`msgctxt ${this.formatPOString(unit.context)}`);
      }
      lines.push(`msgid ${this.formatPOString(unit.sourceText)}`);
      lines.push(`msgstr ${this.formatPOString(unit.targetText || '')}`);
      lines.push('');
    }

    return {
      success: true,
      format: 'po',
      content: lines.join('\n'),
      filename: `${projectId}_${targetLanguage}.po`,
      mimeType: 'text/x-gettext-translation',
      totalUnits: units.length,
      duration: Date.now() - startTime,
    };
  }

  private formatPOString(text: string): string {
    const escaped = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');

    if (escaped.length > 70) {
      const chunks: string[] = [];
      let remaining = escaped;
      while (remaining.length > 70) {
        let breakPoint = remaining.lastIndexOf(' ', 70);
        if (breakPoint <= 0) breakPoint = 70;
        chunks.push(remaining.substring(0, breakPoint));
        remaining = remaining.substring(breakPoint);
      }
      if (remaining.length > 0) chunks.push(remaining);

      return '""\n' + chunks.map(c => `"${c}"`).join('\n');
    }

    return `"${escaped}"`;
  }

  async importJSON(
    content: string,
    projectId: string,
    targetLanguage: string,
    flatten: boolean = true,
  ): Promise<ImportResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];
    let importedUnits = 0;
    let failedUnits = 0;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        success: false,
        format: 'json',
        totalUnits: 0,
        importedUnits: 0,
        skippedUnits: 0,
        failedUnits: 0,
        warnings,
        errors: ['Invalid JSON format'],
        duration: Date.now() - startTime,
      };
    }

    const entries = flatten ? this.flattenObject(parsed) : parsed;
    const flatEntries = entries as Record<string, string>;

    for (const [key, value] of Object.entries(flatEntries)) {
      if (typeof value !== 'string') continue;

      try {
        await this.prisma.translationUnit.upsert({
          where: {
            projectId_sourceLanguage_targetLanguage_sourceText: {
              projectId,
              sourceLanguage: 'en',
              targetLanguage,
              sourceText: key,
            },
          },
          update: {
            targetText: value,
            state: value ? 'translated' : 'new',
            updatedAt: new Date(),
          },
          create: {
            id: crypto.randomUUID(),
            projectId,
            sourceLanguage: 'en',
            targetLanguage,
            sourceText: key,
            targetText: value,
            state: value ? 'translated' : 'new',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        importedUnits++;
      } catch (error) {
        failedUnits++;
        errors.push(`Failed to import key "${key}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      success: failedUnits === 0,
      format: 'json',
      totalUnits: Object.keys(flatEntries).length,
      importedUnits,
      skippedUnits: 0,
      failedUnits,
      warnings,
      errors,
      duration: Date.now() - startTime,
    };
  }

  private flattenObject(
    obj: Record<string, unknown>,
    prefix: string = '',
    result: Record<string, string> = {},
  ): Record<string, string> {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') {
        result[fullKey] = value;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.flattenObject(value as Record<string, unknown>, fullKey, result);
      } else if (Array.isArray(value)) {
        value.forEach((item, idx) => {
          if (typeof item === 'string') {
            result[`${fullKey}[${idx}]`] = item;
          }
        });
      }
    }
    return result;
  }

  async exportJSON(
    projectId: string,
    targetLanguage: string,
    config: LocalizationFileConfig,
  ): Promise<ExportResult> {
    const startTime = Date.now();

    const units = await this.prisma.translationUnit.findMany({
      where: {
        projectId,
        targetLanguage,
        ...(config.includeEmpty ? {} : { targetText: { not: '' } }),
      },
      orderBy: { sourceText: 'asc' },
    });

    let result: Record<string, unknown>;

    if (config.flattenKeys) {
      result = {};
      for (const unit of units) {
        result[unit.sourceText] = unit.targetText || '';
      }
    } else {
      result = {};
      for (const unit of units) {
        this.setNestedValue(result, unit.sourceText, unit.targetText || '');
      }
    }

    if (config.sortKeys) {
      result = this.sortObjectKeys(result);
    }

    const jsonContent = JSON.stringify(result, null, 2);

    return {
      success: true,
      format: 'json',
      content: jsonContent,
      filename: `${config.namespace || projectId}_${targetLanguage}.json`,
      mimeType: 'application/json',
      totalUnits: units.length,
      duration: Date.now() - startTime,
    };
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: string): void {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }

  private sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sorted[key] = this.sortObjectKeys(value as Record<string, unknown>);
      } else {
        sorted[key] = value;
      }
    }
    return sorted;
  }

  async importTMX(content: string, projectId: string): Promise<ImportResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];
    let importedUnits = 0;
    let failedUnits = 0;

    const entries = this.parseTMX(content);

    for (const entry of entries) {
      try {
        await this.prisma.translationMemory.upsert({
          where: {
            sourceLanguage_targetLanguage_sourceText: {
              sourceLanguage: entry.sourceLanguage as Language,
              targetLanguage: entry.targetLanguage as Language,
              sourceText: entry.source,
            },
          },
          update: {
            targetText: entry.target,
            metadata: entry.metadata as Record<string, string> ?? undefined,
            updatedAt: new Date(),
          },
          create: {
            id: entry.tuid || crypto.randomUUID(),
            sourceLanguage: entry.sourceLanguage as Language,
            targetLanguage: entry.targetLanguage as Language,
            sourceText: entry.source,
            targetText: entry.target,
            metadata: entry.metadata as Record<string, string> ?? undefined,
            createdAt: entry.creationDate || new Date(),
            updatedAt: entry.changeDate || new Date(),
          },
        });
        importedUnits++;
      } catch (error) {
        failedUnits++;
        errors.push(`TMX entry ${entry.tuid}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      success: failedUnits === 0,
      format: 'tmx',
      totalUnits: entries.length,
      importedUnits,
      skippedUnits: 0,
      failedUnits,
      warnings,
      errors,
      duration: Date.now() - startTime,
    };
  }

  private parseTMX(content: string): TMXEntry[] {
    const entries: TMXEntry[] = [];
    const tuRegex = /<tu[^>]*tuid="([^"]*)"[^>]*>([\s\S]*?)<\/tu>/g;

    let match: RegExpExecArray | null;
    while ((match = tuRegex.exec(content)) !== null) {
      const tuid = match[1];
      const tuContent = match[2];

      const tuvRegex = /<tuv[^>]*xml:lang="([^"]*)"[^>]*>([\s\S]*?)<\/tuv>/g;
      const segments: { lang: string; text: string }[] = [];

      let tuvMatch: RegExpExecArray | null;
      while ((tuvMatch = tuvRegex.exec(tuContent)) !== null) {
        const lang = tuvMatch[1];
        const segMatch = tuvMatch[2].match(/<seg>([\s\S]*?)<\/seg>/);
        if (segMatch) {
          segments.push({ lang, text: this.decodeXmlEntities(segMatch[1].trim()) });
        }
      }

      if (segments.length >= 2) {
        entries.push({
          tuid,
          sourceLanguage: segments[0].lang,
          targetLanguage: segments[1].lang,
          source: segments[0].text,
          target: segments[1].text,
        });
      }
    }

    return entries;
  }

  async exportTMX(projectId: string): Promise<ExportResult> {
    const startTime = Date.now();

    const memories = await this.prisma.translationMemory.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<!DOCTYPE tmx SYSTEM "tmx14.dtd">');
    lines.push('<tmx version="1.4">');
    lines.push('  <header creationtool="Rasid" creationtoolversion="1.0" datatype="plaintext" segtype="sentence" adminlang="en"/>');
    lines.push('  <body>');

    for (const mem of memories) {
      lines.push(`    <tu tuid="${this.escapeXml(mem.id)}" creationdate="${mem.createdAt.toISOString()}">`);
      lines.push(`      <tuv xml:lang="${mem.sourceLanguage}">`);
      lines.push(`        <seg>${this.escapeXml(mem.sourceText)}</seg>`);
      lines.push('      </tuv>');
      lines.push(`      <tuv xml:lang="${mem.targetLanguage}">`);
      lines.push(`        <seg>${this.escapeXml(mem.targetText)}</seg>`);
      lines.push('      </tuv>');
      lines.push('    </tu>');
    }

    lines.push('  </body>');
    lines.push('</tmx>');

    return {
      success: true,
      format: 'tmx',
      content: lines.join('\n'),
      filename: `${projectId}_memory.tmx`,
      mimeType: 'application/x-tmx+xml',
      totalUnits: memories.length,
      duration: Date.now() - startTime,
    };
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
}
