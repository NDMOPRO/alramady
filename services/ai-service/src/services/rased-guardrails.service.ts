import { createHash } from 'crypto';
import type { RasedActionContext } from './rased-tool-contracts.js';
import type { RasedRegisteredAction } from './rased-action-registry.service.js';

export type GuardrailDecision = 'PASS' | 'BLOCK' | 'REQUIRE_CONFIRMATION' | 'FLAG';

export interface RasedGuardrailRule {
  rule_id: string;
  name: string;
  severity: 'info' | 'warning' | 'error';
  description: string;
}

export interface GuardrailEvaluation {
  evaluation_id: string;
  decision: GuardrailDecision;
  action: string;
  target: string;
  classification: string;
  required_token?: string;
  rules_triggered: string[];
  reason: string;
  input_snapshot: Record<string, unknown>;
  recorded_at: string;
}

interface EvaluateOptions {
  action: string;
  target?: string;
  classification?: string;
  explicitToken?: string;
  inputSnapshot: Record<string, unknown>;
  registeredAction?: RasedRegisteredAction;
}

const GUARDRAIL_RULES: RasedGuardrailRule[] = [
  {
    rule_id: 'gr-explicit-confirmation',
    name: 'explicit_confirmation_required',
    severity: 'error',
    description: 'النشر العام والحذف والتصدير الحساس وإجراءات overwrite تتطلب رمزًا صريحًا.',
  },
  {
    rule_id: 'gr-restricted-egress',
    name: 'restricted_egress_block',
    severity: 'error',
    description: 'التصنيف restricted يمنع الخروج الخارجي والنشر العام.',
  },
  {
    rule_id: 'gr-prompt-injection',
    name: 'prompt_injection_block',
    severity: 'error',
    description: 'منع التعليمات التي تحاول تجاوز النظام أو الحقن في الـprompt أو OCR أو RAG.',
  },
  {
    rule_id: 'gr-sensitive-flag',
    name: 'sensitive_action_flag',
    severity: 'warning',
    description: 'الأفعال الحساسة تمر مع توثيق إضافي عند تحقق الشروط.',
  },
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s+prompt/i,
  /developer\s+message/i,
  /jailbreak/i,
  /override\s+policy/i,
  /تجاهل\s+.*التعليمات/u,
  /تجاوز\s+.*السياسة/u,
  /اكسر\s+.*الحماية/u,
];

function hashSnapshot(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export class RasedGuardrailsService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  listRules(): RasedGuardrailRule[] {
    return GUARDRAIL_RULES.map((rule) => ({ ...rule }));
  }

  evaluate(context: RasedActionContext, options: EvaluateOptions): GuardrailEvaluation {
    const action = options.action;
    const target = options.target ?? '';
    const classification = options.classification ?? 'internal';
    const snapshotText = JSON.stringify(options.inputSnapshot);
    const rulesTriggered: string[] = [];
    let decision: GuardrailDecision = 'PASS';
    let requiredToken: string | undefined;
    let reason = 'السياسات والـguardrails تسمح بالتنفيذ.';

    if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(snapshotText))) {
      rulesTriggered.push('gr-prompt-injection');
      decision = 'BLOCK';
      reason = 'تم اكتشاف محاولة تجاوز أو حقن تعليمات داخل المدخلات.';
    }

    if (decision !== 'BLOCK' && classification === 'restricted' && /publish|share|connector|external|export/i.test(`${action} ${target}`)) {
      rulesTriggered.push('gr-restricted-egress');
      decision = 'BLOCK';
      reason = 'التصنيف restricted يمنع النشر أو الخروج الخارجي أو التصدير الحساس.';
    }

    if (decision === 'PASS') {
      requiredToken = this.findRequiredToken(action, target, classification, Boolean(options.registeredAction?.sensitive));
      if (requiredToken && options.explicitToken?.trim() !== requiredToken) {
        rulesTriggered.push('gr-explicit-confirmation');
        decision = 'REQUIRE_CONFIRMATION';
        reason = `هذا الإجراء يتطلب الرمز الصريح ${requiredToken}.`;
      }
    }

    if (decision === 'PASS' && options.registeredAction?.sensitive) {
      rulesTriggered.push('gr-sensitive-flag');
      decision = 'FLAG';
      reason = 'الإجراء حساس وسيمر مع توثيق guardrails إضافي.';
    }

    return {
      evaluation_id: `guard_${hashSnapshot({ context, action, target, classification, rulesTriggered, recorded_at: this.now().toISOString() }).slice(0, 16)}`,
      decision,
      action,
      target,
      classification,
      required_token: requiredToken,
      rules_triggered: rulesTriggered,
      reason,
      input_snapshot: options.inputSnapshot,
      recorded_at: this.now().toISOString(),
    };
  }

  private findRequiredToken(action: string, target: string, classification: string, sensitive: boolean): string | undefined {
    if (/publish|public/i.test(`${action} ${target}`)) return 'CONFIRM PUBLISH';
    if (/delete|remove/i.test(action)) return 'CONFIRM DELETE';
    if (/revoke/i.test(action)) return 'CONFIRM REVOKE';
    if (/overwrite|template/i.test(`${action} ${target}`)) return 'CONFIRM OVERWRITE';
    if ((classification === 'confidential' || classification === 'restricted' || sensitive) && /export/i.test(`${action} ${target}`)) {
      return 'CONFIRM EXPORT';
    }
    return undefined;
  }
}
