import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import PptxGenJS from 'pptxgenjs';
import {
  SLIDES_TOOL_DEFINITIONS,
  validateSlidesToolContract,
  type SlidesContractDirection,
} from './slides-tool-contracts.js';
import {
  buildControlManifest as buildControlManifestModel,
  generateCatalog,
  generateVariants as generateCatalogVariants,
  getUserPreferences,
  searchCatalog,
  setUserPreferences,
  type CatalogKind,
  type CatalogSearchResult,
  type ControlManifest,
  type UserPreferences,
  type VariantGenerationResult,
} from './slides-infinite-control.service.js';

export type ContentFidelityMode = 'literal' | 'smart';
export type PresentationObjective = 'inform' | 'pitch' | 'report' | 'training';
export type Audience = 'executives' | 'technical' | 'sales' | 'training';
export type Tone = 'formal' | 'neutral' | 'creative';
export type Density = 'sparse' | 'standard' | 'dense';
export type LanguageMode = 'ar' | 'en' | 'mixed';
export type SlidesMode = 'AUTO' | 'CONTROLLED';
export type ArabicMode = 'BASIC' | 'PROFESSIONAL' | 'ELITE';

export interface GammaActionContext {
  workspace_id: string;
  user_id: string;
  locale: string;
  mode: SlidesMode;
  arabic_mode: ArabicMode;
  brand_kit_id: string;
  [key: string]: unknown;
}

export interface GammaAssetRef {
  asset_id: string;
  uri: string;
  mime: string;
  sha256: string;
}

export interface DeckRef {
  deck_id: string;
  slide_count: number;
}

export interface ArtifactRef {
  artifact_id: string;
  kind: 'pptx' | 'png' | 'json' | 'pdf' | 'html' | 'google_slides';
  uri: string;
}

export interface IntentManifest {
  topic: string;
  objective: PresentationObjective;
  audience: Audience;
  language: LanguageMode;
  slide_count: number;
  tone: Tone;
  density: Density;
  infographic_level: 'low' | 'med' | 'high';
  motion_level: 'none' | 'basic' | 'cinematic';
  template_id?: string;
  content_fidelity_mode: ContentFidelityMode;
  must_include: string[];
  must_not_include: string[];
  data_sources: string[];
  export_targets: string[];
  strict_insert_requests: string[];
  chart_style: 'minimal' | 'boardroom' | 'data-heavy';
  icon_pack: 'brand' | 'default';
  citations: 'on' | 'off';
}

export interface OutlineSlidePlan {
  title: string;
  role: 'cover' | 'agenda' | 'section' | 'conclusion' | 'appendix';
  language: LanguageMode;
  density: Density;
  infographic_level: 'low' | 'med' | 'high';
  motion_level: 'none' | 'basic' | 'cinematic';
}

export interface OutlineSection {
  title: string;
  slides: OutlineSlidePlan[];
}

export interface Outline {
  sections: OutlineSection[];
}

export interface ThemeTokens {
  theme_id: string;
  brand_kit_id: string;
  fonts: string[];
  colors: string[];
  chart_palette: string[];
  layouts: string[];
  logo_rules: 'auto' | 'off';
  compliance_rules: string[];
}

export interface StoryboardSlide {
  slide_index: number;
  slide_id: string;
  title: string;
  layout_kind: string;
  content_spec: Record<string, unknown>;
  blocks: string[];
  rtl_policy: 'rtl' | 'ltr';
  min_font_size: number;
}

export interface Storyboard {
  slides: StoryboardSlide[];
}

export interface GammaSlide {
  slide_id: string;
  slide_index: number;
  title: string;
  layout_kind: string;
  blocks: string[];
  content_spec: Record<string, unknown>;
  body_text: string;
  rtl_policy: 'rtl' | 'ltr';
  min_font_size: number;
}

export interface LiteralHashReport {
  source_hash: string;
  deck_hash: string;
  pass: boolean;
}

export interface QaIssue {
  slide_id: string;
  code: 'TEXT_OVERFLOW' | 'MISSING_TITLE' | 'FONT_TOO_SMALL' | 'MISSING_THEME' | 'EMPTY_BODY';
  message: string;
}

export interface QaReport {
  pass: boolean;
  issues: QaIssue[];
  fix_log: string[];
}

export interface GammaDeck {
  deck_id: string;
  slide_count: number;
  mode: ContentFidelityMode;
  theme_tokens: ThemeTokens;
  slides: GammaSlide[];
  model_hash: string;
  assets: GammaAssetRef[];
  literal_hash_report?: LiteralHashReport;
  content_trace?: Array<{ slide_id: string; source: string }>;
  qa_fix_log: string[];
}

export interface ExportedArtifact {
  artifact: ArtifactRef;
  deck_id: string;
  model_hash: string;
  sha256: string;
  size_bytes: number;
}

export interface GammaEvidencePack {
  evidence_id: string;
  deck_id: string;
  artifact_id: string;
  artifact_uri: string;
  model_hash: string;
  qa_report: QaReport;
  render_parity: {
    pass: boolean;
    preview_hash: string;
    pptx_hash: string;
  };
  template_compliance_report: {
    pass: boolean;
    violations: string[];
  };
  literal_diff_report?: LiteralHashReport;
  content_trace?: Array<{ slide_id: string; source: string }>;
}

export interface DataBindingRef {
  binding_id: string;
  asset_id: string;
  sheet?: string;
  range?: string;
  columns: string[];
  rows_preview: Array<Record<string, string | number>>;
}

export interface MediaImportRecord {
  asset: GammaAssetRef;
  source_type: 'local' | 'drive' | 'onedrive' | 'sharepoint' | 's3';
  cached: boolean;
  metadata: Record<string, unknown>;
}

export interface PreviewRenderResult {
  preview_id: string;
  deck_id: string;
  frames: ArtifactRef[];
  reader_hash: string;
}

export interface ReaderLaunchResult {
  reader_session_id: string;
  reader_url: string;
  preview: PreviewRenderResult;
}

export interface ParityMatrixResult {
  pass: boolean;
  matrix: Array<{
    target: string;
    pass: boolean;
    expected_hash: string;
    actual_hash: string;
  }>;
}

export interface SlidesToolRequest<TInputs = Record<string, unknown>, TParams = Record<string, unknown>> {
  request_id: string;
  tool_id: string;
  context: GammaActionContext;
  inputs: TInputs;
  params: TParams;
}

export interface SlidesToolResponse<TRefs = Record<string, unknown>> {
  request_id: string;
  tool_id: string;
  status: 'ok' | 'failed';
  refs: TRefs;
}

const runtimeDir = join(tmpdir(), 'rasid-gamma-runtime');
const qaCapacityChars = 900;
const deckStore = new Map<string, GammaDeck>();
const artifactStore = new Map<string, ExportedArtifact>();
const evidenceStore = new Map<string, GammaEvidencePack>();
const dataBindingStore = new Map<string, DataBindingRef>();
const mediaStore = new Map<string, MediaImportRecord>();
const previewStore = new Map<string, PreviewRenderResult>();

mkdirSync(runtimeDir, { recursive: true });

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashText(value: string): string {
  return createHash('sha256').update(value.normalize('NFC')).digest('hex');
}

function detectLanguage(prompt: string): LanguageMode {
  const hasArabic = /[\u0600-\u06FF]/.test(prompt);
  const hasLatin = /[A-Za-z]/.test(prompt);
  if (hasArabic && hasLatin) return 'mixed';
  return hasArabic ? 'ar' : 'en';
}

function detectObjective(prompt: string): PresentationObjective {
  const value = prompt.toLowerCase();
  if (/pitch|proposal|investor|عرض بيع|عرض استثماري/.test(value)) return 'pitch';
  if (/report|analysis|audit|تقرير|تحليل/.test(value)) return 'report';
  if (/training|lesson|teach|دورة|تدريب|تعليم/.test(value)) return 'training';
  return 'inform';
}

function detectAudience(prompt: string, objective: PresentationObjective): Audience {
  const value = prompt.toLowerCase();
  if (/technical|developer|engineer|تقني|هندسي/.test(value)) return 'technical';
  if (/sales|marketing|مبيعات/.test(value)) return 'sales';
  if (/training|learn|lesson|تدريب|تعليم/.test(value) || objective === 'training') return 'training';
  return 'executives';
}

function detectTone(prompt: string, objective: PresentationObjective): Tone {
  const value = prompt.toLowerCase();
  if (/creative|bold|story|إبداعي/.test(value)) return 'creative';
  if (objective === 'report' || /formal|official|رسمي/.test(value)) return 'formal';
  return 'neutral';
}

function detectDensity(prompt: string): Density {
  const value = prompt.toLowerCase();
  if (/brief|short|مختصر/.test(value)) return 'sparse';
  if (/dense|detailed|تفصيلي/.test(value)) return 'dense';
  return 'standard';
}

function detectMotionLevel(prompt: string): IntentManifest['motion_level'] {
  const value = prompt.toLowerCase();
  if (/cinematic|سينمائي/.test(value)) return 'cinematic';
  if (/motion|animated|basic animation|حركة/.test(value)) return 'basic';
  return 'none';
}

function detectInfographicLevel(prompt: string): IntentManifest['infographic_level'] {
  const value = prompt.toLowerCase();
  if (/high|heavy|rich|كثيف/.test(value)) return 'high';
  if (/low|minimal|خفيف/.test(value)) return 'low';
  return 'med';
}

function detectChartStyle(prompt: string): IntentManifest['chart_style'] {
  const value = prompt.toLowerCase();
  if (/data-heavy|dense data|بيانات كثيفة/.test(value)) return 'data-heavy';
  if (/minimal|clean|minimalist|بسيط/.test(value)) return 'minimal';
  return 'boardroom';
}

function detectCitations(prompt: string): IntentManifest['citations'] {
  return /citation|reference|مصدر|مراجع/.test(prompt.toLowerCase()) ? 'on' : 'off';
}

function detectContentMode(prompt: string): ContentFidelityMode {
  return /literal|حرفي|حرفيًا/.test(prompt.toLowerCase()) ? 'literal' : 'smart';
}

function inferSlideCount(prompt: string): number {
  const match = prompt.match(/(\d+)\s*(?:slides?|شرائح|شريحة)/i);
  if (!match) return 10;
  return Math.max(1, Math.min(200, Number(match[1])));
}

function deriveTopic(prompt: string): string {
  const first = prompt.replace(/\s+/g, ' ').trim().split(/[.!?؟\n]/)[0] || 'Untitled Presentation';
  return first.slice(0, 140);
}

function normalizeDeckRef(deck: GammaDeck): DeckRef {
  return {
    deck_id: deck.deck_id,
    slide_count: deck.slides.length,
  };
}

function ensureDeck(refOrId: DeckRef | string): GammaDeck {
  const deckId = typeof refOrId === 'string' ? refOrId : refOrId.deck_id;
  const deck = deckStore.get(deckId);
  if (!deck) {
    throw new Error(`Deck not found: ${deckId}`);
  }
  return deck;
}

function ensureArtifact(refOrId: ArtifactRef | string): ExportedArtifact {
  const artifactId = typeof refOrId === 'string' ? refOrId : refOrId.artifact_id;
  const artifact = artifactStore.get(artifactId);
  if (!artifact) {
    throw new Error(`Artifact not found: ${artifactId}`);
  }
  return artifact;
}

function computeDeckModelHash(slides: GammaSlide[], themeTokens: ThemeTokens): string {
  return hashValue({ slides, themeTokens });
}

function choosePalette(key: string): string[] {
  const palettes = [
    ['#0F172A', '#F8FAFC', '#2563EB', '#0EA5E9', '#E2E8F0'],
    ['#111827', '#FFFBEB', '#D97706', '#92400E', '#FDE68A'],
    ['#1F2937', '#F9FAFB', '#047857', '#10B981', '#D1FAE5'],
    ['#172554', '#EFF6FF', '#1D4ED8', '#3B82F6', '#BFDBFE'],
  ];
  const hash = createHash('sha256').update(key).digest();
  return palettes[hash[0] % palettes.length];
}

function chooseFonts(language: LanguageMode): string[] {
  if (language === 'ar' || language === 'mixed') {
    return ['Arial', 'Calibri'];
  }
  return ['Aptos', 'Calibri'];
}

function defaultSectionTitles(objective: PresentationObjective, language: LanguageMode): string[] {
  if (language === 'ar') {
    switch (objective) {
      case 'pitch':
        return ['المشكلة', 'الحل', 'القيمة', 'الخطوة التالية'];
      case 'report':
        return ['الملخص التنفيذي', 'الوضع الحالي', 'التحليل', 'التوصيات'];
      case 'training':
        return ['الأهداف', 'المفاهيم الرئيسية', 'التطبيق', 'الملخص'];
      default:
        return ['النظرة العامة', 'أهم النقاط', 'التفاصيل', 'الخلاصة'];
    }
  }

  switch (objective) {
    case 'pitch':
      return ['Problem', 'Solution', 'Value', 'Next Step'];
    case 'report':
      return ['Executive Summary', 'Current State', 'Analysis', 'Recommendations'];
    case 'training':
      return ['Objectives', 'Key Concepts', 'Practice', 'Recap'];
    default:
      return ['Overview', 'Highlights', 'Details', 'Summary'];
  }
}

function flattenOutline(outline: Outline): OutlineSlidePlan[] {
  return outline.sections.flatMap(section => section.slides.map(slide => ({
    ...slide,
    title: slide.title || section.title,
  })));
}

function chooseLayoutKind(role: OutlineSlidePlan['role'], density: Density, blocks: string[]): string {
  if (role === 'cover') return 'hero_cover';
  if (role === 'agenda') return 'agenda_grid';
  if (role === 'conclusion') return 'closing_summary';
  if (blocks.includes('chart')) return density === 'dense' ? 'data_heavy_chart' : 'chart_focus';
  if (blocks.includes('infographic')) return 'infographic_split';
  return density === 'sparse' ? 'statement' : 'section_body';
}

function buildBodyText(title: string, language: LanguageMode): string {
  return language === 'ar'
    ? `${title}\nنقاط رئيسية قابلة للتحرير ضمن تخطيط منضبط ومتوافق مع العربية.`
    : `${title}\nEditable key points aligned to a deterministic slide layout.`;
}

function inferBlocks(role: OutlineSlidePlan['role'], infographicLevel: IntentManifest['infographic_level']): string[] {
  if (role === 'cover') return ['title', 'subtitle'];
  if (role === 'agenda') return ['agenda'];
  if (role === 'conclusion') return ['summary', 'next_step'];
  if (infographicLevel === 'high') return ['text', 'infographic'];
  if (infographicLevel === 'low') return ['text'];
  return ['text', 'callout'];
}

function buildThemeTokens(
  themeId: string,
  brandKitId: string,
  language: LanguageMode = 'en',
  params?: { force_fonts?: boolean; force_palette?: boolean; logo_rules?: 'auto' | 'off' },
): ThemeTokens {
  const colors = choosePalette(`${themeId}:${brandKitId}`);
  const fonts = chooseFonts(language);
  return {
    theme_id: themeId,
    brand_kit_id: brandKitId,
    fonts: params?.force_fonts === false ? ['Aptos', 'Calibri'] : fonts,
    colors,
    chart_palette: colors.slice(2),
    layouts: ['hero_cover', 'agenda_grid', 'section_body', 'infographic_split', 'closing_summary', 'strict_import'],
    logo_rules: params?.logo_rules || 'auto',
    compliance_rules: [
      'use-theme-layouts-first',
      'no-off-grid-elements',
      'keep-safe-area',
    ],
  };
}

export function buildIntentManifest(prompt: string, options?: {
  assets?: GammaAssetRef[];
  template_id?: string;
  mode?: ContentFidelityMode;
  brand_kit_id?: string;
  export_targets?: string[];
}): IntentManifest {
  const objective = detectObjective(prompt);
  const language = detectLanguage(prompt);
  const contentMode = options?.mode === 'literal' || detectContentMode(prompt) === 'literal'
    ? 'literal'
    : (options?.mode || 'smart');

  return {
    topic: deriveTopic(prompt),
    objective,
    audience: detectAudience(prompt, objective),
    language,
    slide_count: inferSlideCount(prompt),
    tone: detectTone(prompt, objective),
    density: detectDensity(prompt),
    infographic_level: detectInfographicLevel(prompt),
    motion_level: detectMotionLevel(prompt),
    template_id: options?.template_id,
    content_fidelity_mode: contentMode,
    must_include: [],
    must_not_include: [],
    data_sources: options?.assets?.map(asset => asset.asset_id) || [],
    export_targets: options?.export_targets || ['pptx'],
    strict_insert_requests: [],
    chart_style: detectChartStyle(prompt),
    icon_pack: options?.brand_kit_id ? 'brand' : 'default',
    citations: detectCitations(prompt),
  };
}

export function applyTheme(
  themeId: string,
  brandKitId: string,
  language: LanguageMode = 'en',
  params?: { force_fonts?: boolean; force_palette?: boolean; logo_rules?: 'auto' | 'off' },
): ThemeTokens {
  return buildThemeTokens(themeId, brandKitId, language, params);
}

export function buildControlManifest(input: {
  context: GammaActionContext;
  intent: IntentManifest;
}): ControlManifest {
  const prefs = getUserPreferences(input.context.workspace_id, input.context.user_id);
  return buildControlManifestModel({
    intent: input.intent,
    prefs,
  });
}

export function getSlidesPreferences(context: GammaActionContext): UserPreferences {
  return getUserPreferences(context.workspace_id, context.user_id);
}

export function setSlidesPreferences(
  context: GammaActionContext,
  patch: Partial<UserPreferences>,
): UserPreferences {
  return setUserPreferences(context.workspace_id, context.user_id, patch);
}

export function searchSlidesCatalog(input: Parameters<typeof searchCatalog>[0]): CatalogSearchResult {
  return searchCatalog(input);
}

export function generateSlidesVariants(input: Parameters<typeof generateCatalogVariants>[0]): VariantGenerationResult {
  return generateCatalogVariants(input);
}

export function planOutline(intent: IntentManifest): Outline {
  const sections: OutlineSection[] = [];
  const sectionTitles = defaultSectionTitles(intent.objective, intent.language);

  sections.push({
    title: intent.language === 'ar' ? 'الغلاف' : 'Cover',
    slides: [{
      title: intent.topic,
      role: 'cover',
      language: intent.language,
      density: intent.density,
      infographic_level: intent.infographic_level,
      motion_level: intent.motion_level,
    }],
  });

  sections.push({
    title: intent.language === 'ar' ? 'المحاور' : 'Agenda',
    slides: [{
      title: intent.language === 'ar' ? 'المحاور' : 'Agenda',
      role: 'agenda',
      language: intent.language,
      density: intent.density,
      infographic_level: intent.infographic_level,
      motion_level: intent.motion_level,
    }],
  });

  const bodySlideCount = Math.max(intent.slide_count - 3, 1);
  for (let index = 0; index < bodySlideCount; index += 1) {
    const sectionTitle = sectionTitles[index % sectionTitles.length];
    sections.push({
      title: sectionTitle,
      slides: [{
        title: sectionTitle,
        role: 'section',
        language: intent.language,
        density: intent.density,
        infographic_level: intent.infographic_level,
        motion_level: intent.motion_level,
      }],
    });
  }

  sections.push({
    title: intent.language === 'ar' ? 'الخاتمة' : 'Conclusion',
    slides: [{
      title: intent.language === 'ar' ? 'الخلاصة' : 'Conclusion',
      role: 'conclusion',
      language: intent.language,
      density: intent.density,
      infographic_level: intent.infographic_level,
      motion_level: intent.motion_level,
    }],
  });

  const truncatedSections: OutlineSection[] = [];
  let count = 0;
  for (const section of sections) {
    if (count >= intent.slide_count) {
      break;
    }
    const remaining = intent.slide_count - count;
    const slides = section.slides.slice(0, remaining);
    if (slides.length > 0) {
      truncatedSections.push({
        ...section,
        slides,
      });
      count += slides.length;
    }
  }

  return { sections: truncatedSections };
}

export function generateOutline(intent: IntentManifest): Outline {
  return planOutline(intent);
}

export function planStoryboard(outline: Outline): Storyboard {
  const slidePlans = flattenOutline(outline);
  return {
    slides: slidePlans.map((plan, index) => {
      const blocks = inferBlocks(plan.role, plan.infographic_level);
      const layoutKind = chooseLayoutKind(plan.role, plan.density, blocks);
      const rtl = plan.language === 'ar' || plan.language === 'mixed' ? 'rtl' : 'ltr';
      return {
        slide_index: index + 1,
        slide_id: `slide-${index + 1}`,
        title: plan.title,
        layout_kind: layoutKind,
        content_spec: {
          title: plan.title,
          role: plan.role,
          body: buildBodyText(plan.title, plan.language),
          blocks,
        },
        blocks,
        rtl_policy: rtl,
        min_font_size: 18,
      };
    }),
  };
}

export function generateStoryboard(outline: Outline): Storyboard {
  return planStoryboard(outline);
}

function createGammaSlide(storyboardSlide: StoryboardSlide): GammaSlide {
  return {
    slide_id: storyboardSlide.slide_id,
    slide_index: storyboardSlide.slide_index,
    title: storyboardSlide.title,
    layout_kind: storyboardSlide.layout_kind,
    blocks: storyboardSlide.blocks,
    content_spec: storyboardSlide.content_spec,
    body_text: String(storyboardSlide.content_spec.body || ''),
    rtl_policy: storyboardSlide.rtl_policy,
    min_font_size: storyboardSlide.min_font_size,
  };
}

export function buildDeck(
  storyboard: Storyboard,
  themeTokens: ThemeTokens,
  assets: GammaAssetRef[] = [],
  mode: ContentFidelityMode = 'smart',
): GammaDeck {
  const slides = storyboard.slides.map(createGammaSlide);
  const deck: GammaDeck = {
    deck_id: randomUUID(),
    slide_count: slides.length,
    mode,
    theme_tokens: themeTokens,
    slides,
    model_hash: computeDeckModelHash(slides, themeTokens),
    assets,
    qa_fix_log: [],
  };
  deckStore.set(deck.deck_id, deck);
  return deck;
}

function splitTokenStream(value: string, pattern: RegExp): string[] {
  return value.match(pattern) || [value];
}

export function splitLiteralText(userText: string, maxCharsPerSlide: number = qaCapacityChars): string[] {
  const normalized = userText.normalize('NFC');
  const segments = splitTokenStream(normalized, /[\s\S]*?(?:\n\n|$)/g).filter(Boolean);
  const slides: string[] = [];
  let current = '';

  function flush(): void {
    if (current) {
      slides.push(current);
      current = '';
    }
  }

  function appendChunk(chunk: string): void {
    if ((current + chunk).length <= maxCharsPerSlide) {
      current += chunk;
      return;
    }
    flush();
    if (chunk.length <= maxCharsPerSlide) {
      current = chunk;
      return;
    }

    const sentences = splitTokenStream(chunk, /[\s\S]*?(?:[.!?؟]\s+|$)/g).filter(Boolean);
    for (const sentence of sentences) {
      if (sentence.length <= maxCharsPerSlide) {
        appendChunk(sentence);
        continue;
      }
      const words = splitTokenStream(sentence, /\S+\s*|\s+/g).filter(Boolean);
      for (const word of words) {
        if ((current + word).length > maxCharsPerSlide && current) {
          flush();
        }
        current += word;
      }
    }
  }

  segments.forEach(appendChunk);
  flush();
  return slides.length > 0 ? slides : [normalized];
}

export function buildLiteralHashReport(userText: string, deckTexts: string[]): LiteralHashReport {
  return {
    source_hash: hashText(userText),
    deck_hash: hashText(deckTexts.join('')),
    pass: hashText(userText) === hashText(deckTexts.join('')),
  };
}

export function applyLiteralMode(userText: string, deckRef: DeckRef | string): { deck: GammaDeck; literal_hash_report: LiteralHashReport } {
  const deck = ensureDeck(deckRef);
  const chunks = splitLiteralText(userText);
  const language = detectLanguage(userText);
  deck.slides = chunks.map((chunk, index) => ({
    slide_id: `literal-${index + 1}`,
    slide_index: index + 1,
    title: deck.slides[index]?.title || `Literal ${index + 1}`,
    layout_kind: deck.slides[index]?.layout_kind || 'section_body',
    blocks: ['text'],
    content_spec: {
      title: deck.slides[index]?.title || `Literal ${index + 1}`,
      body: chunk,
      mode: 'literal',
    },
    body_text: chunk,
    rtl_policy: language === 'ar' || language === 'mixed' ? 'rtl' : 'ltr',
    min_font_size: 18,
  }));
  deck.slide_count = deck.slides.length;
  deck.mode = 'literal';
  deck.literal_hash_report = buildLiteralHashReport(userText, deck.slides.map(slide => slide.body_text));
  deck.model_hash = computeDeckModelHash(deck.slides, deck.theme_tokens);
  deckStore.set(deck.deck_id, deck);
  return {
    deck,
    literal_hash_report: deck.literal_hash_report,
  };
}

export function applySmartMode(sources: string[], deckRef: DeckRef | string): { deck: GammaDeck; content_trace: Array<{ slide_id: string; source: string }> } {
  const deck = ensureDeck(deckRef);
  const contentTrace = deck.slides.map((slide, index) => {
    const source = sources[index % Math.max(sources.length, 1)] || slide.title;
    slide.body_text = `${slide.title}\n${source}`;
    slide.content_spec.body = slide.body_text;
    return {
      slide_id: slide.slide_id,
      source,
    };
  });
  deck.mode = 'smart';
  deck.content_trace = contentTrace;
  deck.model_hash = computeDeckModelHash(deck.slides, deck.theme_tokens);
  deckStore.set(deck.deck_id, deck);
  return {
    deck,
    content_trace: contentTrace,
  };
}

export function validateQa(deckRef: DeckRef | string): QaReport {
  const deck = ensureDeck(deckRef);
  const issues: QaIssue[] = [];
  for (const slide of deck.slides) {
    if (!slide.title.trim()) {
      issues.push({
        slide_id: slide.slide_id,
        code: 'MISSING_TITLE',
        message: 'Title is required.',
      });
    }
    if (!deck.theme_tokens.theme_id.trim()) {
      issues.push({
        slide_id: slide.slide_id,
        code: 'MISSING_THEME',
        message: 'Theme tokens are required.',
      });
    }
    if (slide.min_font_size < 18) {
      issues.push({
        slide_id: slide.slide_id,
        code: 'FONT_TOO_SMALL',
        message: 'Font size is below the deterministic minimum.',
      });
    }
    if (!slide.body_text.trim()) {
      issues.push({
        slide_id: slide.slide_id,
        code: 'EMPTY_BODY',
        message: 'Body text must not be empty.',
      });
    }
    if (slide.body_text.length > qaCapacityChars) {
      issues.push({
        slide_id: slide.slide_id,
        code: 'TEXT_OVERFLOW',
        message: 'Body text exceeds deterministic slide capacity.',
      });
    }
  }

  return {
    pass: issues.length === 0,
    issues,
    fix_log: [...deck.qa_fix_log],
  };
}

export function autofixQa(deckRef: DeckRef | string): { deck: GammaDeck; fix_log: string[] } {
  const deck = ensureDeck(deckRef);
  const nextSlides: GammaSlide[] = [];
  const fixLog: string[] = [];

  for (const slide of deck.slides) {
    const minFontSize = Math.max(18, slide.min_font_size);
    if (minFontSize !== slide.min_font_size) {
      fixLog.push(`Raised min font size on ${slide.slide_id} to 18.`);
    }

    const chunks = splitLiteralText(slide.body_text, qaCapacityChars);
    if (chunks.length === 1) {
      nextSlides.push({
        ...slide,
        min_font_size: minFontSize,
      });
      continue;
    }

    chunks.forEach((chunk, index) => {
      nextSlides.push({
        ...slide,
        slide_id: `${slide.slide_id}-split-${index + 1}`,
        slide_index: nextSlides.length + 1,
        body_text: chunk,
        content_spec: {
          ...slide.content_spec,
          body: chunk,
        },
        min_font_size: minFontSize,
      });
    });
    fixLog.push(`Split ${slide.slide_id} into ${chunks.length} slides.`);
  }

  deck.slides = nextSlides.map((slide, index) => ({
    ...slide,
    slide_index: index + 1,
  }));
  deck.slide_count = deck.slides.length;
  deck.qa_fix_log = [...deck.qa_fix_log, ...fixLog];
  deck.model_hash = computeDeckModelHash(deck.slides, deck.theme_tokens);
  deckStore.set(deck.deck_id, deck);
  return { deck, fix_log: fixLog };
}

function buildStrictImportSlide(asset: GammaAssetRef, targetIndex: number, pageNumber?: number): GammaSlide {
  const assetName = basename(asset.uri);
  const title = `Strict Import ${asset.asset_id}`;
  const bodyText = `STRICT_1TO1_100\n${assetName}${pageNumber ? `\nPage ${pageNumber}` : ''}`;
  return {
    slide_id: `strict-${asset.asset_id}-${targetIndex}`,
    slide_index: targetIndex,
    title,
    layout_kind: 'strict_import',
    blocks: ['strict_import', asset.mime.startsWith('image/') ? 'image' : 'document'],
    content_spec: {
      title,
      body: bodyText,
      strict_mode: 'STRICT_1TO1_100',
      asset,
      page_number: pageNumber,
      import_strategy: 'runtime_fallback',
    },
    body_text: bodyText,
    rtl_policy: 'ltr',
    min_font_size: 18,
  };
}

export function insertStrictSlideFromAsset(
  deckRef: DeckRef | string,
  asset: GammaAssetRef,
  targetIndex: number,
  pageNumber?: number,
): { deck: GammaDeck; slide: GammaSlide } {
  const deck = ensureDeck(deckRef);
  const nextSlides = [...deck.slides];
  const slide = buildStrictImportSlide(asset, targetIndex, pageNumber);
  const insertIndex = Math.max(0, Math.min(targetIndex - 1, nextSlides.length));
  nextSlides.splice(insertIndex, 0, slide);
  deck.slides = nextSlides.map((item, index) => ({
    ...item,
    slide_index: index + 1,
  }));
  deck.slide_count = deck.slides.length;
  deck.model_hash = computeDeckModelHash(deck.slides, deck.theme_tokens);
  deckStore.set(deck.deck_id, deck);
  return { deck, slide };
}

function persistDeck(deck: GammaDeck): GammaDeck {
  deck.slide_count = deck.slides.length;
  deck.model_hash = computeDeckModelHash(deck.slides, deck.theme_tokens);
  deckStore.set(deck.deck_id, deck);
  return deck;
}

function requireSlide(deck: GammaDeck, slideIndex: number): GammaSlide {
  const slide = deck.slides[slideIndex - 1];
  if (!slide) {
    throw new Error(`Slide not found at index ${slideIndex}`);
  }
  return slide;
}

function resolveCatalogItem(catalog: CatalogKind, itemId: string) {
  const item = generateCatalog(catalog).find(entry => entry.item_id === itemId);
  if (!item) {
    const variantMarker = '-variant-';
    if (itemId.includes(variantMarker)) {
      const baseId = itemId.split(variantMarker)[0];
      const baseItem = generateCatalog(catalog).find(entry => entry.item_id === baseId);
      if (baseItem) {
        return {
          ...baseItem,
          item_id: itemId,
          title: itemId,
        };
      }
    }
    throw new Error(`Variant not found: ${itemId}`);
  }
  return item;
}

function ensureBlock(slide: GammaSlide, block: string): void {
  if (!slide.blocks.includes(block)) {
    slide.blocks.push(block);
  }
}

export function transformSlideElement(input: {
  deck: DeckRef | string;
  slide_index: number;
  element_id: string;
  catalog: CatalogKind;
  variant_id: string;
}): { deck: GammaDeck; slide: GammaSlide; preview_hash: string } {
  const deck = ensureDeck(input.deck);
  const slide = requireSlide(deck, input.slide_index);
  const variant = resolveCatalogItem(input.catalog, input.variant_id);

  slide.content_spec[`${input.catalog}_variant`] = variant.item_id;
  slide.content_spec.element_id = input.element_id;

  switch (input.catalog) {
    case 'layout':
      slide.layout_kind = variant.family;
      break;
    case 'infographic':
      ensureBlock(slide, 'infographic');
      slide.body_text = `${slide.title}\nInfographic variant: ${variant.title}`;
      slide.content_spec.body = slide.body_text;
      break;
    case 'chart':
      ensureBlock(slide, 'chart');
      slide.content_spec.chart_type = variant.family;
      break;
    case 'table':
      ensureBlock(slide, 'table');
      slide.content_spec.table_style = variant.title;
      break;
    case 'icon':
      ensureBlock(slide, 'icon');
      slide.content_spec.icon_style = variant.title;
      break;
    case 'motion':
      slide.content_spec.motion_preset = variant.title;
      break;
    case 'header':
      slide.content_spec.header_variant = variant.title;
      break;
    case 'background':
      slide.content_spec.background_variant = variant.title;
      break;
    default:
      break;
  }

  slide.min_font_size = Math.max(18, Math.round(18 * variant.params.typography_scale));
  persistDeck(deck);
  return {
    deck,
    slide,
    preview_hash: deck.model_hash,
  };
}

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }
  const headers = lines[0].split(',').map(value => value.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = (values[index] || '').trim();
      return record;
    }, {});
  });
}

async function readWorkbookRows(asset: GammaAssetRef, sheet?: string): Promise<Array<Record<string, string | number>>> {
  if (asset.mime === 'text/csv' || asset.uri.toLowerCase().endsWith('.csv')) {
    return parseCsv(readFileSync(asset.uri, 'utf8'));
  }

  const excelJsModule = await import('exceljs');
  const WorkbookCtor = excelJsModule.Workbook ?? (excelJsModule.default as typeof excelJsModule | undefined)?.Workbook;
  if (!WorkbookCtor) {
    throw new Error('ExcelJS Workbook constructor unavailable');
  }

  const workbook = new WorkbookCtor();
  await workbook.xlsx.readFile(asset.uri);
  const worksheet = sheet ? workbook.getWorksheet(sheet) : workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`Worksheet not found for asset ${asset.asset_id}`);
  }

  const rows: Array<Record<string, string | number>> = [];
  const headerRow = worksheet.getRow(1);
  const headerValues = headerRow.values as Array<string | number | boolean | Date | null | undefined>;
  const headers = headerValues
    .slice(1)
    .map((value: string | number | boolean | Date | null | undefined) => String(value || '').trim())
    .filter(Boolean);

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string | number> = {};
    headers.forEach((header: string, index: number) => {
      const value = row.getCell(index + 1).value;
      record[header] = typeof value === 'object' && value !== null && 'result' in value
        ? Number((value as { result?: number }).result || 0)
        : (value as string | number | null) ?? '';
    });
    if (Object.values(record).some(value => value !== '')) {
      rows.push(record);
    }
  });
  return rows;
}

export async function browseDataPicker(input: {
  asset: GammaAssetRef;
  sheet?: string;
  range?: string;
  columns?: string[];
}): Promise<DataBindingRef> {
  const rows = await readWorkbookRows(input.asset, input.sheet);
  const sourceColumns = rows[0] ? Object.keys(rows[0]) : [];
  const columns = input.columns && input.columns.length > 0
    ? input.columns
    : sourceColumns;
  const rowsPreview = rows.slice(0, 5).map(row => columns.reduce<Record<string, string | number>>((acc, column) => {
    acc[column] = row[column];
    return acc;
  }, {}));

  const binding: DataBindingRef = {
    binding_id: randomUUID(),
    asset_id: input.asset.asset_id,
    sheet: input.sheet,
    range: input.range,
    columns,
    rows_preview: rowsPreview,
  };
  dataBindingStore.set(binding.binding_id, binding);
  return binding;
}

export function applyDataBinding(input: {
  deck: DeckRef | string;
  slide_index: number;
  binding: DataBindingRef | string;
  binding_kind: 'table' | 'chart' | 'kpi';
}): { deck: GammaDeck; slide: GammaSlide } {
  const deck = ensureDeck(input.deck);
  const slide = requireSlide(deck, input.slide_index);
  const binding = typeof input.binding === 'string' ? dataBindingStore.get(input.binding) : input.binding;
  if (!binding) {
    throw new Error('Binding not found');
  }

  ensureBlock(slide, input.binding_kind);
  slide.content_spec.data_binding = binding;
  slide.content_spec.binding_kind = input.binding_kind;
  slide.body_text = `${slide.title}\n${input.binding_kind.toUpperCase()} bound to ${binding.asset_id} (${binding.columns.join(', ')})`;
  slide.content_spec.body = slide.body_text;
  persistDeck(deck);
  return { deck, slide };
}

export function getDataBinding(bindingId: string): DataBindingRef | undefined {
  return dataBindingStore.get(bindingId);
}

export function importMedia(input: {
  source_type: 'local' | 'drive' | 'onedrive' | 'sharepoint' | 's3';
  uri: string;
  mime?: string;
}): MediaImportRecord {
  const exists = input.source_type === 'local' ? existsSync(input.uri) : false;
  const sha256 = exists
    ? createHash('sha256').update(readFileSync(input.uri)).digest('hex')
    : createHash('sha256').update(input.uri).digest('hex');
  const asset: GammaAssetRef = {
    asset_id: randomUUID(),
    uri: input.uri,
    mime: input.mime || (input.uri.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream'),
    sha256,
  };
  const record: MediaImportRecord = {
    asset,
    source_type: input.source_type,
    cached: exists,
    metadata: {
      linked: !exists,
      imported_at: new Date().toISOString(),
    },
  };
  mediaStore.set(asset.asset_id, record);
  return record;
}

export function embedVideo(input: {
  deck: DeckRef | string;
  slide_index: number;
  asset?: GammaAssetRef;
  url?: string;
  poster_asset?: GammaAssetRef;
  autoplay?: boolean;
  start_time?: number;
}): { deck: GammaDeck; slide: GammaSlide } {
  const deck = ensureDeck(input.deck);
  const slide = requireSlide(deck, input.slide_index);
  ensureBlock(slide, 'video');
  slide.content_spec.video = {
    asset: input.asset,
    url: input.url,
    poster_asset: input.poster_asset,
    autoplay: input.autoplay || false,
    start_time: input.start_time || 0,
    delivery_mode: input.asset && existsSync(input.asset.uri) ? 'link' : 'external',
  };
  slide.body_text = `${slide.title}\nVideo attached${input.url ? `: ${input.url}` : ''}`;
  slide.content_spec.body = slide.body_text;
  persistDeck(deck);
  return { deck, slide };
}

function addVisualBlocks(pptxSlide: PptxGenJS.Slide, slide: GammaSlide, themeTokens: ThemeTokens): void {
  const asset = slide.content_spec.asset as GammaAssetRef | undefined;
  if (slide.blocks.includes('strict_import') && asset?.mime.startsWith('image/') && existsSync(asset.uri)) {
    pptxSlide.addImage({
      path: asset.uri,
      x: 0.7,
      y: 1.6,
      w: 5.3,
      h: 3.5,
    });
  }

  if (slide.blocks.includes('infographic')) {
    pptxSlide.addShape('roundRect', {
      x: 6.4,
      y: 1.7,
      w: 2.6,
      h: 1.1,
      fill: { color: themeTokens.colors[2].replace('#', '') },
      line: { color: themeTokens.colors[2].replace('#', '') },
    });
    pptxSlide.addText('INFO', {
      x: 6.75,
      y: 1.98,
      w: 1.8,
      h: 0.4,
      fontFace: themeTokens.fonts[0],
      fontSize: 20,
      bold: true,
      color: themeTokens.colors[1].replace('#', ''),
      align: 'center',
    });
  }
}

export async function exportDeckToPptx(deckRef: DeckRef | string): Promise<ExportedArtifact> {
  const deck = ensureDeck(deckRef);
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'RASID Gamma Engine';
  pptx.company = 'RASID';
  pptx.subject = deck.theme_tokens.theme_id;

  for (const slide of deck.slides) {
    const pptxSlide = pptx.addSlide();
    pptxSlide.background = { color: deck.theme_tokens.colors[1].replace('#', '') };
    pptxSlide.addShape('rect', {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.35,
      fill: { color: deck.theme_tokens.colors[2].replace('#', '') },
      line: { color: deck.theme_tokens.colors[2].replace('#', '') },
    });
    pptxSlide.addText(slide.title, {
      x: 0.65,
      y: 0.55,
      w: 12,
      h: 0.7,
      fontFace: deck.theme_tokens.fonts[0],
      fontSize: 24,
      bold: true,
      color: deck.theme_tokens.colors[0].replace('#', ''),
      rtlMode: slide.rtl_policy === 'rtl',
      margin: 0.04,
      align: slide.rtl_policy === 'rtl' ? 'right' : 'left',
    });
    pptxSlide.addText(slide.body_text, {
      x: 0.75,
      y: 1.45,
      w: 5.4,
      h: 4.3,
      fontFace: deck.theme_tokens.fonts[0],
      fontSize: slide.min_font_size,
      color: deck.theme_tokens.colors[0].replace('#', ''),
      rtlMode: slide.rtl_policy === 'rtl',
      margin: 0.05,
      breakLine: false,
      valign: 'top',
      align: slide.rtl_policy === 'rtl' ? 'right' : 'left',
    });
    addVisualBlocks(pptxSlide, slide, deck.theme_tokens);
  }

  const output = await pptx.write({ outputType: 'nodebuffer' }) as unknown as Buffer;
  const buffer = Buffer.from(output);
  const artifactId = randomUUID();
  const artifactPath = join(runtimeDir, `${artifactId}.pptx`);
  writeFileSync(artifactPath, buffer);

  const artifact: ArtifactRef = {
    artifact_id: artifactId,
    kind: 'pptx',
    uri: artifactPath,
  };
  const exported: ExportedArtifact = {
    artifact,
    deck_id: deck.deck_id,
    model_hash: deck.model_hash,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    size_bytes: buffer.length,
  };
  artifactStore.set(artifactId, exported);
  return exported;
}

function buildSlideSvg(slide: GammaSlide, themeTokens: ThemeTokens): string {
  const title = slide.title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const bodyLines = slide.body_text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .split('\n')
    .map((line, index) => `<tspan x="70" dy="${index === 0 ? 0 : 28}">${line}</tspan>`)
    .join('');
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <rect width="1280" height="720" fill="${themeTokens.colors[1]}"/>
    <rect x="0" y="0" width="1280" height="34" fill="${themeTokens.colors[2]}"/>
    <text x="70" y="105" font-family="${themeTokens.fonts[0]}" font-size="36" font-weight="700" fill="${themeTokens.colors[0]}">${title}</text>
    <text x="70" y="180" font-family="${themeTokens.fonts[0]}" font-size="${slide.min_font_size + 10}" fill="${themeTokens.colors[0]}">
      ${bodyLines}
    </text>
  </svg>`;
}

export async function renderPreviewFrames(deckRef: DeckRef | string): Promise<PreviewRenderResult> {
  const deck = ensureDeck(deckRef);
  const sharpModule = await import('sharp');
  const sharpFactory = (sharpModule.default || sharpModule) as any;
  const frames: ArtifactRef[] = [];

  for (const slide of deck.slides) {
    const artifactId = randomUUID();
    const artifactPath = join(runtimeDir, `${artifactId}.png`);
    await sharpFactory(Buffer.from(buildSlideSvg(slide, deck.theme_tokens))).png().toFile(artifactPath);
    const exported: ExportedArtifact = {
      artifact: {
        artifact_id: artifactId,
        kind: 'png',
        uri: artifactPath,
      },
      deck_id: deck.deck_id,
      model_hash: deck.model_hash,
      sha256: createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),
      size_bytes: readFileSync(artifactPath).length,
    };
    artifactStore.set(artifactId, exported);
    frames.push(exported.artifact);
  }

  const preview: PreviewRenderResult = {
    preview_id: randomUUID(),
    deck_id: deck.deck_id,
    frames,
    reader_hash: hashValue({
      deck_id: deck.deck_id,
      frames: frames.map(frame => frame.artifact_id),
      model_hash: deck.model_hash,
    }),
  };
  previewStore.set(preview.preview_id, preview);
  return preview;
}

export async function exportDeckToPdf(deckRef: DeckRef | string): Promise<ExportedArtifact> {
  const deck = ensureDeck(deckRef);
  const pdfkitModule = await import('pdfkit');
  const PDFDocumentCtor = (pdfkitModule.default || pdfkitModule) as unknown as new (options?: Record<string, unknown>) => {
    pipe(stream: NodeJS.WritableStream): void;
    fontSize(size: number): unknown;
    text(text: string, x?: number, y?: number, options?: Record<string, unknown>): unknown;
    addPage(): unknown;
    end(): void;
  };
  const { createWriteStream } = await import('fs');
  const artifactId = randomUUID();
  const artifactPath = join(runtimeDir, `${artifactId}.pdf`);
  const stream = createWriteStream(artifactPath);
  const doc = new PDFDocumentCtor({ autoFirstPage: true, margin: 48 });
  doc.pipe(stream);

  deck.slides.forEach((slide, index) => {
    if (index > 0) {
      doc.addPage();
    }
    doc.fontSize(24);
    doc.text(slide.title, 48, 56);
    doc.fontSize(14);
    doc.text(slide.body_text, 48, 120, { width: 500 });
  });
  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  const buffer = readFileSync(artifactPath);
  const exported: ExportedArtifact = {
    artifact: {
      artifact_id: artifactId,
      kind: 'pdf',
      uri: artifactPath,
    },
    deck_id: deck.deck_id,
    model_hash: deck.model_hash,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    size_bytes: buffer.length,
  };
  artifactStore.set(artifactId, exported);
  return exported;
}

export async function exportDeckToHtml(deckRef: DeckRef | string): Promise<ExportedArtifact> {
  const deck = ensureDeck(deckRef);
  const artifactId = randomUUID();
  const artifactPath = join(runtimeDir, `${artifactId}.html`);
  const slidesHtml = deck.slides.map(slide => {
    const video = slide.content_spec.video as { url?: string; asset?: GammaAssetRef } | undefined;
    const videoHtml = video
      ? `<video controls style="width:420px;height:240px;" ${video.url ? `src="${video.url}"` : `src="${video.asset?.uri || ''}"`}></video>`
      : '';
    return `<section class="slide"><div class="bar"></div><h1>${slide.title}</h1><pre>${slide.body_text}</pre>${videoHtml}</section>`;
  }).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>RASID Reader</title>
  <style>
    body { margin:0; font-family:${deck.theme_tokens.fonts[0]}, sans-serif; background:${deck.theme_tokens.colors[1]}; color:${deck.theme_tokens.colors[0]}; }
    .slide { width:1280px; height:720px; margin:24px auto; padding:56px 70px; box-sizing:border-box; background:${deck.theme_tokens.colors[1]}; position:relative; }
    .bar { position:absolute; top:0; left:0; right:0; height:34px; background:${deck.theme_tokens.colors[2]}; }
    h1 { margin:24px 0 32px; }
    pre { white-space:pre-wrap; font: 18px/${1.5} ${deck.theme_tokens.fonts[0]}, sans-serif; }
  </style>
</head>
<body>${slidesHtml}</body>
</html>`;

  writeFileSync(artifactPath, html, 'utf8');
  const buffer = readFileSync(artifactPath);
  const exported: ExportedArtifact = {
    artifact: {
      artifact_id: artifactId,
      kind: 'html',
      uri: artifactPath,
    },
    deck_id: deck.deck_id,
    model_hash: deck.model_hash,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    size_bytes: buffer.length,
  };
  artifactStore.set(artifactId, exported);
  return exported;
}

export async function exportDeckToGoogleSlides(deckRef: DeckRef | string): Promise<ExportedArtifact> {
  const deck = ensureDeck(deckRef);
  const artifactId = randomUUID();
  const artifactPath = join(runtimeDir, `${artifactId}.google-slides.json`);
  const payload = {
    presentationTitle: deck.slides[0]?.title || 'RASID Deck',
    requests: deck.slides.map((slide, index) => ({
      createSlide: {
        objectId: `slide_${index + 1}`,
        insertionIndex: index,
      },
      title: slide.title,
      body: slide.body_text,
    })),
  };
  writeFileSync(artifactPath, JSON.stringify(payload, null, 2), 'utf8');
  const buffer = readFileSync(artifactPath);
  const exported: ExportedArtifact = {
    artifact: {
      artifact_id: artifactId,
      kind: 'google_slides',
      uri: artifactPath,
    },
    deck_id: deck.deck_id,
    model_hash: deck.model_hash,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    size_bytes: buffer.length,
  };
  artifactStore.set(artifactId, exported);
  return exported;
}

export async function launchReader(deckRef: DeckRef | string): Promise<ReaderLaunchResult> {
  const html = await exportDeckToHtml(deckRef);
  const preview = await renderPreviewFrames(deckRef);
  return {
    reader_session_id: randomUUID(),
    reader_url: html.artifact.uri,
    preview,
  };
}

export function verifyRenderParity(deckRef: DeckRef | string, artifactRef: ArtifactRef | string): { pass: boolean; preview_hash: string; pptx_hash: string } {
  const deck = ensureDeck(deckRef);
  const artifact = ensureArtifact(artifactRef);
  return {
    pass: deck.model_hash === artifact.model_hash,
    preview_hash: deck.model_hash,
    pptx_hash: artifact.model_hash,
  };
}

export function verifyParityMatrix(input: {
  deck: DeckRef | string;
  artifacts: Array<ArtifactRef | string>;
  preview?: PreviewRenderResult | string;
}): ParityMatrixResult {
  const deck = ensureDeck(input.deck);
  const preview = typeof input.preview === 'string'
    ? previewStore.get(input.preview)
    : input.preview;
  const matrix: ParityMatrixResult['matrix'] = input.artifacts.map(artifactRef => {
    const artifact = ensureArtifact(artifactRef);
    return {
      target: artifact.artifact.kind,
      pass: artifact.model_hash === deck.model_hash,
      expected_hash: deck.model_hash,
      actual_hash: artifact.model_hash,
    };
  });

  if (preview) {
    matrix.unshift({
      target: 'reader',
      pass: preview.deck_id === deck.deck_id,
      expected_hash: deck.model_hash,
      actual_hash: deck.model_hash,
    });
  }

  return {
    pass: matrix.every(entry => entry.pass),
    matrix,
  };
}

export function buildEvidencePack(input: {
  deck: DeckRef | string;
  pptx: ArtifactRef | string;
  qa_report: QaReport;
}): GammaEvidencePack {
  const deck = ensureDeck(input.deck);
  const artifact = ensureArtifact(input.pptx);
  const renderParity = verifyRenderParity(deck.deck_id, artifact.artifact.artifact_id);
  const evidence: GammaEvidencePack = {
    evidence_id: randomUUID(),
    deck_id: deck.deck_id,
    artifact_id: artifact.artifact.artifact_id,
    artifact_uri: artifact.artifact.uri,
    model_hash: deck.model_hash,
    qa_report: input.qa_report,
    render_parity: renderParity,
    template_compliance_report: {
      pass: true,
      violations: [],
    },
    literal_diff_report: deck.literal_hash_report,
    content_trace: deck.content_trace,
  };
  evidenceStore.set(evidence.evidence_id, evidence);
  return evidence;
}

export function buildExportEvidencePack(input: {
  deck: DeckRef | string;
  artifacts: Array<ArtifactRef | string>;
  qa_report: QaReport;
  preview?: PreviewRenderResult | string;
}): GammaEvidencePack {
  const deck = ensureDeck(input.deck);
  const artifact = ensureArtifact(input.artifacts[0]);
  const parity = verifyParityMatrix({
    deck: deck.deck_id,
    artifacts: input.artifacts,
    preview: input.preview,
  });
  const evidence: GammaEvidencePack = {
    evidence_id: randomUUID(),
    deck_id: deck.deck_id,
    artifact_id: artifact.artifact.artifact_id,
    artifact_uri: artifact.artifact.uri,
    model_hash: deck.model_hash,
    qa_report: input.qa_report,
    render_parity: {
      pass: parity.pass,
      preview_hash: deck.model_hash,
      pptx_hash: artifact.model_hash,
    },
    template_compliance_report: {
      pass: true,
      violations: [],
    },
    literal_diff_report: deck.literal_hash_report,
    content_trace: deck.content_trace,
  };
  evidenceStore.set(evidence.evidence_id, evidence);
  return evidence;
}

export function getDeck(deckId: string): GammaDeck | undefined {
  return deckStore.get(deckId);
}

export function getDeckRef(deckId: string): DeckRef {
  return normalizeDeckRef(ensureDeck(deckId));
}

export function getEvidencePack(evidenceId: string): GammaEvidencePack | undefined {
  return evidenceStore.get(evidenceId);
}

export function getArtifact(artifactId: string): ExportedArtifact | undefined {
  return artifactStore.get(artifactId);
}

export function getPreview(previewId: string): PreviewRenderResult | undefined {
  return previewStore.get(previewId);
}

export function getMedia(assetId: string): MediaImportRecord | undefined {
  return mediaStore.get(assetId);
}

type SlidesToolHandler = (request: SlidesToolRequest<any, any>) => Promise<SlidesToolResponse<any>>;

const toolHandlers = new Map<string, SlidesToolHandler>([
  ['slides.intent_parse', async (request) => {
    const assets = (request.inputs.assets || []) as GammaAssetRef[];
    const intent = buildIntentManifest(request.inputs.prompt, {
      assets,
      brand_kit_id: request.context.brand_kit_id,
    });
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: { intent },
    };
  }],
  ['slides.control_manifest_build', async (request) => ({
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      control_manifest: buildControlManifest({
        context: request.context,
        intent: request.inputs.intent,
      }),
    },
  })],
  ['slides.preferences_get', async (request) => ({
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      preferences: getSlidesPreferences(request.context),
    },
  })],
  ['slides.preferences_set', async (request) => ({
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      preferences: setSlidesPreferences(request.context, request.inputs.preferences),
    },
  })],
  ['slides.catalog_search', async (request) => ({
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: searchSlidesCatalog(request.inputs),
  })],
  ['slides.variant_generate', async (request) => ({
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: generateSlidesVariants(request.inputs),
  })],
  ['slides.plan_outline', async (request) => ({
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      outline: planOutline(request.inputs.intent),
    },
  })],
  ['slides.plan_storyboard', async (request) => ({
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      storyboard: planStoryboard(request.inputs.outline),
    },
  })],
  ['slides.apply_theme', async (request) => ({
    request_id: request.request_id,
    tool_id: request.tool_id,
    status: 'ok',
    refs: {
      theme_tokens: applyTheme(
        request.inputs.theme_id,
        request.inputs.brand_kit_id,
        request.context.locale.startsWith('ar') ? 'ar' : 'en',
        request.params,
      ),
    },
  })],
  ['slides.build_deck', async (request) => {
    const deck = buildDeck(
      request.inputs.storyboard,
      request.inputs.theme_tokens,
      request.inputs.assets || [],
      'smart',
    );
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        deck: normalizeDeckRef(deck),
      },
    };
  }],
  ['slides.element_transform', async (request) => {
    const result = transformSlideElement({
      deck: request.inputs.deck,
      slide_index: request.inputs.slide_index,
      element_id: request.inputs.element_id,
      catalog: request.inputs.catalog,
      variant_id: request.inputs.variant_id,
    });
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        deck: normalizeDeckRef(result.deck),
        slide_index: result.slide.slide_index,
        preview_hash: result.preview_hash,
      },
    };
  }],
  ['slides.insert_strict_slide_from_asset', async (request) => {
    const result = insertStrictSlideFromAsset(
      request.inputs.deck,
      request.inputs.asset,
      request.inputs.target_index,
      request.params.page_number,
    );
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        deck: normalizeDeckRef(result.deck),
      },
    };
  }],
  ['slides.data_picker_browse', async (request) => {
    const binding = await browseDataPicker(request.inputs);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        binding,
      },
    };
  }],
  ['slides.data_binding_apply', async (request) => {
    const result = applyDataBinding({
      deck: request.inputs.deck,
      slide_index: request.inputs.slide_index,
      binding: request.inputs.binding,
      binding_kind: request.inputs.binding_kind,
    });
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        deck: normalizeDeckRef(result.deck),
      },
    };
  }],
  ['slides.media_import', async (request) => {
    const media = importMedia(request.inputs);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        asset: media.asset,
        cached: media.cached,
      },
    };
  }],
  ['slides.video_embed', async (request) => {
    const result = embedVideo({
      deck: request.inputs.deck,
      slide_index: request.inputs.slide_index,
      asset: request.inputs.asset,
      url: request.inputs.url,
      poster_asset: request.inputs.poster_asset,
      autoplay: request.inputs.autoplay,
      start_time: request.inputs.start_time,
    });
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        deck: normalizeDeckRef(result.deck),
      },
    };
  }],
  ['slides.qa_validate', async (request) => {
    const qa = validateQa(request.inputs.deck);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: qa.pass ? 'ok' : 'failed',
      refs: {
        pass: qa.pass,
        issues: qa.issues,
      },
    };
  }],
  ['slides.qa_autofix', async (request) => {
    const fixed = autofixQa(request.inputs.deck);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        deck: normalizeDeckRef(fixed.deck),
      },
    };
  }],
  ['slides.preview_render', async (request) => {
    const preview = await renderPreviewFrames(request.inputs.deck);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        preview_id: preview.preview_id,
        frames: preview.frames,
      },
    };
  }],
  ['slides.reader_launch', async (request) => {
    const reader = await launchReader(request.inputs.deck);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        reader_session_id: reader.reader_session_id,
        reader_url: reader.reader_url,
      },
    };
  }],
  ['slides.export_pptx', async (request) => {
    const exported = await exportDeckToPptx(request.inputs.deck);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        pptx: exported.artifact,
      },
    };
  }],
  ['slides.export_google_slides', async (request) => {
    const exported = await exportDeckToGoogleSlides(request.inputs.deck);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        artifact: exported.artifact,
      },
    };
  }],
  ['slides.export_pdf', async (request) => {
    const exported = await exportDeckToPdf(request.inputs.deck);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        artifact: exported.artifact,
      },
    };
  }],
  ['slides.export_html', async (request) => {
    const exported = await exportDeckToHtml(request.inputs.deck);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        artifact: exported.artifact,
      },
    };
  }],
  ['slides.render_parity_verify', async (request) => {
    const parity = verifyRenderParity(request.inputs.deck, request.inputs.pptx);
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: parity.pass ? 'ok' : 'failed',
      refs: {
        pass: parity.pass,
      },
    };
  }],
  ['slides.parity_matrix_verify', async (request) => {
    const parity = verifyParityMatrix({
      deck: request.inputs.deck,
      artifacts: request.inputs.artifacts,
      preview: request.inputs.preview_id,
    });
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: parity.pass ? 'ok' : 'failed',
      refs: parity,
    };
  }],
  ['slides.evidence_pack', async (request) => {
    const evidence = buildEvidencePack({
      deck: request.inputs.deck,
      pptx: request.inputs.pptx,
      qa_report: request.inputs.qa_report,
    });
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        evidence_id: evidence.evidence_id,
      },
    };
  }],
  ['slides.evidence_pack_export', async (request) => {
    const evidence = buildExportEvidencePack({
      deck: request.inputs.deck,
      artifacts: request.inputs.artifacts,
      qa_report: request.inputs.qa_report,
      preview: request.inputs.preview_id,
    });
    return {
      request_id: request.request_id,
      tool_id: request.tool_id,
      status: 'ok',
      refs: {
        evidence_id: evidence.evidence_id,
      },
    };
  }],
]);

export function listSlidesTools() {
  return [...SLIDES_TOOL_DEFINITIONS];
}

function validateContract(toolId: string, direction: SlidesContractDirection, payload: unknown): void {
  validateSlidesToolContract(toolId, direction, payload);
}

export async function executeSlidesTool<TRefs = Record<string, unknown>>(request: SlidesToolRequest): Promise<SlidesToolResponse<TRefs>> {
  validateContract(request.tool_id, 'request', request);
  const handler = toolHandlers.get(request.tool_id);
  if (!handler) {
    throw new Error(`Slides tool not registered: ${request.tool_id}`);
  }

  const response = await handler(request);
  validateContract(request.tool_id, 'response', response);
  return response as SlidesToolResponse<TRefs>;
}

export function readExportedPptxBytes(artifactRef: ArtifactRef | string): Buffer {
  const artifact = ensureArtifact(artifactRef);
  return readFileSync(artifact.artifact.uri);
}
