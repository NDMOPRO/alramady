import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// ─── Interfaces ──────────────────────────────────────────────────────────────

type ThreatType = 'injection' | 'jailbreak' | 'data_extraction' | 'role_manipulation';
type Severity = 'low' | 'medium' | 'high' | 'critical';

interface Threat {
  type: ThreatType;
  severity: Severity;
  pattern: string;
  position: number;
}

interface ScanResult {
  safe: boolean;
  threats: Threat[];
  sanitizedInput: string;
  riskScore: number;
}

interface PatternDefinition {
  regex: RegExp;
  type: ThreatType;
  severity: Severity;
  label: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class PromptInjectionGuardService {
  private readonly patterns: PatternDefinition[] = [
    // Injection patterns
    { regex: /ignore\s+(all\s+)?previous\s+(instructions|prompts|rules|context)/i, type: 'injection', severity: 'critical', label: 'ignore previous instructions' },
    { regex: /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)/i, type: 'injection', severity: 'critical', label: 'disregard instructions' },
    { regex: /forget\s+(everything|all|your)\s+(you|instructions|rules|previous)/i, type: 'injection', severity: 'critical', label: 'forget instructions' },
    { regex: /override\s+(your|all|the)\s+(instructions|rules|constraints|guidelines)/i, type: 'injection', severity: 'critical', label: 'override instructions' },
    { regex: /new\s+instructions?\s*:/i, type: 'injection', severity: 'high', label: 'new instructions directive' },
    { regex: /\[SYSTEM\]/i, type: 'injection', severity: 'critical', label: 'system tag injection' },
    { regex: /\[INST\]/i, type: 'injection', severity: 'critical', label: 'instruction tag injection' },
    { regex: /<<\s*SYS\s*>>/i, type: 'injection', severity: 'critical', label: 'system block injection' },

    // Jailbreak patterns
    { regex: /you\s+are\s+now\s+/i, type: 'jailbreak', severity: 'high', label: 'role reassignment' },
    { regex: /pretend\s+(you\s+are|to\s+be|you're)/i, type: 'jailbreak', severity: 'high', label: 'pretend directive' },
    { regex: /act\s+as\s+(if\s+you\s+are|a|an)\s+/i, type: 'jailbreak', severity: 'high', label: 'act as directive' },
    { regex: /from\s+now\s+on\s*,?\s*(you|your)\s/i, type: 'jailbreak', severity: 'high', label: 'behavioral override' },
    { regex: /enter\s+(DAN|developer|debug|god)\s+mode/i, type: 'jailbreak', severity: 'critical', label: 'special mode activation' },
    { regex: /jailbreak/i, type: 'jailbreak', severity: 'critical', label: 'explicit jailbreak mention' },
    { regex: /do\s+anything\s+now/i, type: 'jailbreak', severity: 'critical', label: 'DAN pattern' },
    { regex: /without\s+(any\s+)?(restrictions|limitations|filters|constraints)/i, type: 'jailbreak', severity: 'high', label: 'restriction removal' },
    { regex: /no\s+(ethical|moral|safety)\s+(guidelines|constraints|restrictions)/i, type: 'jailbreak', severity: 'critical', label: 'safety bypass' },

    // Data extraction patterns
    { regex: /system\s+prompt/i, type: 'data_extraction', severity: 'high', label: 'system prompt extraction' },
    { regex: /reveal\s+(your|the)\s+(instructions|prompt|rules|system)/i, type: 'data_extraction', severity: 'high', label: 'instruction reveal' },
    { regex: /show\s+(me\s+)?(your|the)\s+(initial|original|system)\s+(prompt|instructions)/i, type: 'data_extraction', severity: 'high', label: 'prompt disclosure' },
    { regex: /what\s+(are|were)\s+your\s+(original|initial|system)\s+(instructions|rules|prompt)/i, type: 'data_extraction', severity: 'medium', label: 'instruction query' },
    { regex: /repeat\s+(the\s+)?(text|words|instructions)\s+above/i, type: 'data_extraction', severity: 'high', label: 'repeat above text' },
    { regex: /print\s+(your|the)\s+(system|initial)\s+(message|prompt)/i, type: 'data_extraction', severity: 'high', label: 'print system prompt' },
    { regex: /output\s+(your\s+)?(instructions|configuration|system\s+prompt)/i, type: 'data_extraction', severity: 'high', label: 'output configuration' },

    // Role manipulation patterns
    { regex: /you\s+(must|should|have\s+to)\s+(always|never)\s/i, type: 'role_manipulation', severity: 'medium', label: 'behavioral constraint' },
    { regex: /your\s+(true|real|actual)\s+(purpose|role|function)\s+is/i, type: 'role_manipulation', severity: 'high', label: 'purpose redefinition' },
    { regex: /you\s+don'?t\s+have\s+(to|any)\s+(follow|rules|restrictions)/i, type: 'role_manipulation', severity: 'high', label: 'rule dismissal' },
    { regex: /respond\s+(only\s+)?(in|with)\s+(code|json|xml)\s+without\s+(any\s+)?explanation/i, type: 'role_manipulation', severity: 'medium', label: 'output format manipulation' },
  ];

  private readonly UNICODE_HOMOGLYPHS: Map<string, string> = new Map([
    ['\u0410', 'A'], ['\u0412', 'B'], ['\u0421', 'C'], ['\u0415', 'E'],
    ['\u041D', 'H'], ['\u041A', 'K'], ['\u041C', 'M'], ['\u041E', 'O'],
    ['\u0420', 'P'], ['\u0422', 'T'], ['\u0425', 'X'],
    ['\u0430', 'a'], ['\u0435', 'e'], ['\u043E', 'o'], ['\u0440', 'p'],
    ['\u0441', 'c'], ['\u0443', 'y'], ['\u0445', 'x'],
    ['\u2000', ' '], ['\u2001', ' '], ['\u2002', ' '], ['\u2003', ' '],
    ['\u200B', ''],  // zero-width space
    ['\u200C', ''],  // zero-width non-joiner
    ['\u200D', ''],  // zero-width joiner
    ['\uFEFF', ''],  // BOM
  ]);

  constructor(private prisma: PrismaClient) {}

  async scanInput(input: string, context?: string): Promise<ScanResult> {
    if (!input) {
      return { safe: true, threats: [], sanitizedInput: '', riskScore: 0 };
    }

    const threats: Threat[] = [];

    // Layer 1: Normalize unicode homoglyphs before pattern matching
    const normalized = this.normalizeUnicode(input);

    // Layer 2: Decode any base64 or hex encoded content
    const decodedVariants = this.extractEncodedContent(normalized);
    const allVariants = [normalized, ...decodedVariants];

    // Layer 3: Pattern matching against known injection patterns
    for (const variant of allVariants) {
      for (const patternDef of this.patterns) {
        const match = variant.match(patternDef.regex);
        if (match && match.index !== undefined) {
          const alreadyFound = threats.some(
            (t) => t.type === patternDef.type && t.pattern === patternDef.label,
          );
          if (!alreadyFound) {
            threats.push({
              type: patternDef.type,
              severity: patternDef.severity,
              pattern: patternDef.label,
              position: match.index,
            });
          }
        }
      }
    }

    // Layer 4: Structural analysis (nested quotes, escape sequences)
    const structuralThreats = this.analyzeStructure(normalized);
    threats.push(...structuralThreats);

    // Layer 5: Entropy analysis (high entropy may indicate encoded payload)
    const entropyScore = this.calculateEntropy(input);
    if (entropyScore > 5.5 && input.length > 100) {
      threats.push({
        type: 'injection',
        severity: 'medium',
        pattern: 'high entropy content (possible encoded payload)',
        position: 0,
      });
    }

    // Layer 6: Sudden language switch detection
    if (context) {
      const contextLang = this.detectPrimaryScript(context);
      const inputLang = this.detectPrimaryScript(input);
      if (contextLang !== 'mixed' && inputLang !== 'mixed' && contextLang !== inputLang && input.length > 20) {
        threats.push({
          type: 'injection',
          severity: 'low',
          pattern: `language switch detected (${contextLang} -> ${inputLang})`,
          position: 0,
        });
      }
    }

    // Calculate risk score (0-100)
    const riskScore = this.calculateRiskScore(threats);
    const sanitizedInput = this.sanitize(input);
    const safe = threats.length === 0;

    logger.debug('Prompt injection scan completed', {
      inputLength: input.length,
      threatCount: threats.length,
      riskScore,
      safe,
    });

    return { safe, threats, sanitizedInput, riskScore };
  }

  sanitize(input: string): string {
    let sanitized = this.normalizeUnicode(input);

    // Remove common injection delimiters
    sanitized = sanitized.replace(/\[SYSTEM\]/gi, '[FILTERED]');
    sanitized = sanitized.replace(/\[INST\]/gi, '[FILTERED]');
    sanitized = sanitized.replace(/<<\s*SYS\s*>>/gi, '[FILTERED]');
    sanitized = sanitized.replace(/<<\s*\/SYS\s*>>/gi, '[FILTERED]');

    // Escape backticks that could break prompt boundaries
    sanitized = sanitized.replace(/`{3,}/g, '```');

    // Remove zero-width characters
    sanitized = sanitized.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

    // Normalize whitespace
    sanitized = sanitized.replace(/[\u2000-\u200A\u202F\u205F\u3000]/g, ' ');

    // Remove control characters except newline, tab, carriage return
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized.trim();
  }

  async logThreat(tenantId: string, input: string, result: ScanResult): Promise<void> {
    if (!tenantId) {
      throw new Error('Tenant ID is required for threat logging');
    }

    const threatId = crypto.randomUUID();
    const truncatedInput = input.length > 1000 ? input.slice(0, 1000) + '...[truncated]' : input;

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: 'system',
        action: 'prompt_injection.detected',
        entityType: 'prompt_injection_threat',
        entityId: threatId,
        detailsJson: {
          threatId,
          input: truncatedInput,
          riskScore: result.riskScore,
          threatCount: result.threats.length,
          threats: result.threats.map((t) => ({
            type: t.type,
            severity: t.severity,
            pattern: t.pattern,
            position: t.position,
          })),
          detectedAt: new Date().toISOString(),
        },
      },
    });

    logger.warn('Prompt injection threat logged', {
      threatId,
      tenantId,
      riskScore: result.riskScore,
      threatCount: result.threats.length,
      topThreats: result.threats.slice(0, 3).map((t) => t.pattern),
    });
  }

  private normalizeUnicode(input: string): string {
    let result = input;
    for (const [homoglyph, replacement] of this.UNICODE_HOMOGLYPHS) {
      result = result.split(homoglyph).join(replacement);
    }
    return result;
  }

  private extractEncodedContent(input: string): string[] {
    const decoded: string[] = [];

    // Detect and decode base64 segments
    const base64Pattern = /[A-Za-z0-9+/]{20,}={0,2}/g;
    let match: RegExpExecArray | null;
    while ((match = base64Pattern.exec(input)) !== null) {
      try {
        const candidate = Buffer.from(match[0], 'base64').toString('utf-8');
        // Only consider it valid if it contains mostly printable characters
        const printableRatio = candidate.replace(/[^\x20-\x7E]/g, '').length / candidate.length;
        if (printableRatio > 0.8 && candidate.length > 5) {
          decoded.push(candidate);
        }
      } catch {
        // Not valid base64, skip
      }
    }

    // Detect and decode hex-encoded segments
    const hexPattern = /(?:0x)?([0-9a-fA-F]{20,})/g;
    while ((match = hexPattern.exec(input)) !== null) {
      try {
        const hexStr = match[1];
        const candidate = Buffer.from(hexStr, 'hex').toString('utf-8');
        const printableRatio = candidate.replace(/[^\x20-\x7E]/g, '').length / candidate.length;
        if (printableRatio > 0.8 && candidate.length > 5) {
          decoded.push(candidate);
        }
      } catch {
        // Not valid hex, skip
      }
    }

    return decoded;
  }

  private analyzeStructure(input: string): Threat[] {
    const threats: Threat[] = [];

    // Deeply nested quotes (potential delimiter confusion)
    const nestedQuoteDepth = this.maxNestedQuoteDepth(input);
    if (nestedQuoteDepth >= 4) {
      threats.push({
        type: 'injection',
        severity: 'medium',
        pattern: `deeply nested quotes (depth: ${nestedQuoteDepth})`,
        position: 0,
      });
    }

    // Multiple escape sequences in succession
    const escapeSequences = input.match(/\\{3,}/g);
    if (escapeSequences && escapeSequences.length > 0) {
      threats.push({
        type: 'injection',
        severity: 'low',
        pattern: 'excessive escape sequences',
        position: input.indexOf(escapeSequences[0]),
      });
    }

    // Markdown/formatting injection (trying to create fake system messages)
    const fakeSystemMatch = input.match(/^#{1,3}\s*(system|assistant|user)\s*:?\s/im);
    if (fakeSystemMatch && fakeSystemMatch.index !== undefined) {
      threats.push({
        type: 'injection',
        severity: 'high',
        pattern: 'fake role header in markdown',
        position: fakeSystemMatch.index,
      });
    }

    // XML/HTML tag injection for prompt structure
    const xmlRoleMatch = input.match(/<\s*(system|assistant|user|instruction|prompt)\s*>/i);
    if (xmlRoleMatch && xmlRoleMatch.index !== undefined) {
      threats.push({
        type: 'injection',
        severity: 'high',
        pattern: 'XML role tag injection',
        position: xmlRoleMatch.index,
      });
    }

    return threats;
  }

  private maxNestedQuoteDepth(input: string): number {
    let maxDepth = 0;
    let currentDepth = 0;
    const quoteChars = new Set(['"', "'", '`']);

    for (const char of input) {
      if (quoteChars.has(char)) {
        currentDepth++;
        if (currentDepth > maxDepth) {
          maxDepth = currentDepth;
        }
      }
    }

    // Divide by 2 since quotes come in pairs
    return Math.floor(maxDepth / 2);
  }

  private calculateEntropy(input: string): number {
    if (input.length === 0) return 0;

    const freq = new Map<string, number>();
    for (const char of input) {
      freq.set(char, (freq.get(char) ?? 0) + 1);
    }

    let entropy = 0;
    const len = input.length;
    for (const count of freq.values()) {
      const p = count / len;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  private detectPrimaryScript(text: string): 'latin' | 'arabic' | 'cyrillic' | 'cjk' | 'mixed' {
    const counts = { latin: 0, arabic: 0, cyrillic: 0, cjk: 0 };

    for (const char of text) {
      const code = char.codePointAt(0);
      if (code === undefined) continue;

      if ((code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x024F)) {
        counts.latin++;
      } else if (code >= 0x0600 && code <= 0x06FF) {
        counts.arabic++;
      } else if (code >= 0x0400 && code <= 0x04FF) {
        counts.cyrillic++;
      } else if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3040 && code <= 0x30FF)) {
        counts.cjk++;
      }
    }

    const total = counts.latin + counts.arabic + counts.cyrillic + counts.cjk;
    if (total === 0) return 'latin';

    const entries = Object.entries(counts) as Array<[keyof typeof counts, number]>;
    entries.sort((a, b) => b[1] - a[1]);

    const dominant = entries[0];
    if (dominant[1] / total > 0.7) {
      return dominant[0];
    }

    return 'mixed';
  }

  private calculateRiskScore(threats: Threat[]): number {
    if (threats.length === 0) return 0;

    const severityWeights: Record<Severity, number> = {
      critical: 40,
      high: 25,
      medium: 15,
      low: 5,
    };

    let score = 0;
    for (const threat of threats) {
      score += severityWeights[threat.severity];
    }

    // Cap at 100
    return Math.min(100, score);
  }
}
