import { createHash } from 'crypto';

export type ControlMode = 'auto' | 'fixed';
export type CatalogKind =
  | 'layout'
  | 'infographic'
  | 'table'
  | 'chart'
  | 'icon'
  | 'motion'
  | 'header'
  | 'background';

export interface ControlledValue<T> {
  mode: ControlMode;
  value: T;
}

export interface UserPreferences {
  prefs_enabled: boolean;
  default_fidelity_mode: 'literal_1to1' | 'smart';
  default_language: 'ar' | 'en' | 'mixed';
  default_slide_size: '16:9' | '4:3' | 'A4';
  default_tone: 'formal' | 'neutral' | 'creative';
  default_density: 'sparse' | 'standard' | 'dense';
  default_infographic_level: 'low' | 'med' | 'high';
  default_motion_level: 'none' | 'basic' | 'cinematic';
  default_fonts: {
    ar_font: string;
    latin_font: string;
    mono_font: string;
  };
  default_palette: string;
  default_background: 'auto' | 'solid' | 'gradient' | 'image' | 'pattern';
  default_numbering: 'off' | 'slide_x_of_y' | 'section_based' | 'custom';
  default_toc: 'off' | 'on';
  default_header_style: 'auto' | 'boardroom' | 'editorial';
  default_export_targets: Array<'pptx' | 'google_slides' | 'pdf' | 'html'>;
}

export interface ControlManifest {
  prefs_enabled: boolean;
  deck_controls: Record<string, ControlledValue<unknown>>;
  scope_defaults: {
    deck: string[];
    slide: string[];
    element: string[];
  };
  search_controls_enabled: true;
}

export interface CatalogItem {
  item_id: string;
  catalog: CatalogKind;
  family: string;
  title: string;
  tags: string[];
  rtl_ready: boolean;
  density: 'sparse' | 'standard' | 'dense';
  tone: 'formal' | 'neutral' | 'creative';
  brand_compatible: boolean;
  params: {
    spacing_scale: number;
    corner_radius: number;
    stroke_width: number;
    shadow_depth: number;
    palette_mapping: string;
    typography_scale: number;
    rtl_mirroring: boolean;
  };
}

export interface CatalogSearchResult {
  catalog: CatalogKind;
  total_available: number;
  variant_capacity: number;
  items: CatalogItem[];
}

export interface VariantGenerationResult {
  base_item_id: string;
  direction: 'more_like_this' | 'different_direction';
  variants: CatalogItem[];
}

const preferenceStore = new Map<string, UserPreferences>();

const catalogMinimums: Record<CatalogKind, number> = {
  layout: 300,
  infographic: 250,
  table: 200,
  chart: 150,
  icon: 50,
  motion: 80,
  header: 120,
  background: 200,
};

const catalogFamilies: Record<CatalogKind, string[]> = {
  layout: ['hero', 'boardroom', 'editorial', 'split', 'gallery', 'matrix'],
  infographic: ['timeline', 'process', 'swot', 'funnel', 'kpi', 'diagram'],
  table: ['board', 'compact', 'zebra', 'financial', 'heatmap', 'comparison'],
  chart: ['minimal', 'boardroom', 'annotated', 'dense', 'executive'],
  icon: ['outline', 'filled', 'duotone', 'sharp', 'rounded'],
  motion: ['fade', 'slide', 'rise', 'sequence', 'focus'],
  header: ['minimal', 'section', 'chapter', 'branded', 'index'],
  background: ['solid', 'gradient', 'mesh', 'paper', 'grid', 'photo'],
};

function prefKey(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`;
}

export function getDefaultUserPreferences(): UserPreferences {
  return {
    prefs_enabled: true,
    default_fidelity_mode: 'smart',
    default_language: 'ar',
    default_slide_size: '16:9',
    default_tone: 'formal',
    default_density: 'standard',
    default_infographic_level: 'med',
    default_motion_level: 'none',
    default_fonts: {
      ar_font: 'Arial',
      latin_font: 'Aptos',
      mono_font: 'Consolas',
    },
    default_palette: 'brand-auto',
    default_background: 'auto',
    default_numbering: 'slide_x_of_y',
    default_toc: 'off',
    default_header_style: 'auto',
    default_export_targets: ['pptx', 'pdf'],
  };
}

export function getUserPreferences(workspaceId: string, userId: string): UserPreferences {
  const key = prefKey(workspaceId, userId);
  if (!preferenceStore.has(key)) {
    preferenceStore.set(key, getDefaultUserPreferences());
  }
  return preferenceStore.get(key)!;
}

export function setUserPreferences(
  workspaceId: string,
  userId: string,
  patch: Partial<UserPreferences>,
): UserPreferences {
  const current = getUserPreferences(workspaceId, userId);
  const next: UserPreferences = {
    ...current,
    ...patch,
    default_fonts: {
      ...current.default_fonts,
      ...(patch.default_fonts || {}),
    },
    default_export_targets: patch.default_export_targets || current.default_export_targets,
  };
  preferenceStore.set(prefKey(workspaceId, userId), next);
  return next;
}

export function buildControlManifest(input: {
  intent: {
    content_fidelity_mode: 'literal' | 'smart';
    language: 'ar' | 'en' | 'mixed';
    slide_count: number;
    tone: 'formal' | 'neutral' | 'creative';
    density: 'sparse' | 'standard' | 'dense';
    infographic_level: 'low' | 'med' | 'high';
    motion_level: 'none' | 'basic' | 'cinematic';
    export_targets: string[];
    template_id?: string;
  };
  prefs: UserPreferences;
}): ControlManifest {
  const prefsEnabled = input.prefs.prefs_enabled;
  const deckControls: Record<string, ControlledValue<unknown>> = {
    fidelity_mode: {
      mode: 'fixed',
      value: input.intent.content_fidelity_mode === 'literal' ? 'literal_1to1' : 'smart',
    },
    language: {
      mode: input.intent.language === input.prefs.default_language && prefsEnabled ? 'auto' : 'fixed',
      value: input.intent.language,
    },
    slide_count: {
      mode: input.intent.slide_count === 10 && prefsEnabled ? 'auto' : 'fixed',
      value: input.intent.slide_count,
    },
    slide_size: {
      mode: prefsEnabled ? 'auto' : 'fixed',
      value: input.prefs.default_slide_size,
    },
    slide_resolution_hint: { mode: 'auto', value: 'standard' },
    theme_source: {
      mode: input.intent.template_id ? 'fixed' : 'auto',
      value: input.intent.template_id ? 'template_pptx' : 'brand_kit',
    },
    palette: {
      mode: prefsEnabled ? 'auto' : 'fixed',
      value: input.prefs.default_palette,
    },
    fonts: {
      mode: prefsEnabled ? 'auto' : 'fixed',
      value: input.prefs.default_fonts,
    },
    background_style: {
      mode: prefsEnabled ? 'auto' : 'fixed',
      value: input.prefs.default_background,
    },
    tone: {
      mode: input.intent.tone === input.prefs.default_tone && prefsEnabled ? 'auto' : 'fixed',
      value: input.intent.tone,
    },
    density: {
      mode: input.intent.density === input.prefs.default_density && prefsEnabled ? 'auto' : 'fixed',
      value: input.intent.density,
    },
    infographic_level: {
      mode: input.intent.infographic_level === input.prefs.default_infographic_level && prefsEnabled ? 'auto' : 'fixed',
      value: input.intent.infographic_level,
    },
    motion_level: {
      mode: input.intent.motion_level === input.prefs.default_motion_level && prefsEnabled ? 'auto' : 'fixed',
      value: input.intent.motion_level,
    },
    numbering_style: {
      mode: prefsEnabled ? 'auto' : 'fixed',
      value: input.prefs.default_numbering,
    },
    toc_index: {
      mode: prefsEnabled ? 'auto' : 'fixed',
      value: input.prefs.default_toc,
    },
    header_footer_rules: {
      mode: prefsEnabled ? 'auto' : 'fixed',
      value: input.prefs.default_header_style,
    },
    citations: {
      mode: 'auto',
      value: 'off',
    },
    export_targets: {
      mode: 'fixed',
      value: input.intent.export_targets,
    },
  };

  return {
    prefs_enabled: prefsEnabled,
    deck_controls: deckControls,
    scope_defaults: {
      deck: ['fidelity_mode', 'language', 'slide_count', 'theme_source', 'tone', 'density', 'infographic_level', 'motion_level'],
      slide: ['layout_variant', 'infographic_variant', 'chart_style_variant', 'table_style_variant', 'RTL policies'],
      element: ['replace_style', 'convert_to_infographic', 'swap_icon_pack', 'change_chart_type', 'background_treatment'],
    },
    search_controls_enabled: true,
  };
}

function baseCountFor(kind: CatalogKind): number {
  return catalogMinimums[kind];
}

function makeCatalogItem(kind: CatalogKind, index: number, familyIndex: number, variantSeed: number): CatalogItem {
  const families = catalogFamilies[kind];
  const family = families[familyIndex % families.length];
  const density = (['sparse', 'standard', 'dense'] as const)[index % 3];
  const tone = (['formal', 'neutral', 'creative'] as const)[(index + familyIndex) % 3];
  const title = `${family}-${kind}-${index + 1}`;
  return {
    item_id: `${kind}-${family}-${index + 1}`,
    catalog: kind,
    family,
    title,
    tags: [kind, family, density, tone, index % 2 === 0 ? 'rtl-ready' : 'ltr-first'],
    rtl_ready: index % 2 === 0,
    density,
    tone,
    brand_compatible: index % 5 !== 0,
    params: {
      spacing_scale: 1 + ((variantSeed % 5) * 0.1),
      corner_radius: (variantSeed % 8) + 2,
      stroke_width: 1 + (variantSeed % 3),
      shadow_depth: variantSeed % 6,
      palette_mapping: `palette-${(variantSeed % 12) + 1}`,
      typography_scale: 0.9 + ((variantSeed % 4) * 0.1),
      rtl_mirroring: index % 2 === 0,
    },
  };
}

export function generateCatalog(kind: CatalogKind): CatalogItem[] {
  const target = baseCountFor(kind);
  const items: CatalogItem[] = [];
  for (let index = 0; index < target; index += 1) {
    items.push(makeCatalogItem(kind, index, index, index * 7));
  }
  return items;
}

export function searchCatalog(input: {
  catalog: CatalogKind;
  query?: string;
  tags?: string[];
  top_k?: number;
  density?: 'sparse' | 'standard' | 'dense';
  tone?: 'formal' | 'neutral' | 'creative';
  rtl_ready?: boolean;
  brand_compatible?: boolean;
}): CatalogSearchResult {
  const items = generateCatalog(input.catalog);
  const query = (input.query || '').toLowerCase();
  const tags = input.tags || [];
  const scored = items
    .filter(item => {
      if (input.density && item.density !== input.density) return false;
      if (input.tone && item.tone !== input.tone) return false;
      if (typeof input.rtl_ready === 'boolean' && item.rtl_ready !== input.rtl_ready) return false;
      if (typeof input.brand_compatible === 'boolean' && item.brand_compatible !== input.brand_compatible) return false;
      if (tags.length > 0 && !tags.every(tag => item.tags.includes(tag))) return false;
      return true;
    })
    .map(item => {
      let score = 0;
      if (!query) score += 1;
      if (item.title.toLowerCase().includes(query)) score += 5;
      if (item.family.toLowerCase().includes(query)) score += 3;
      score += item.tags.filter(tag => tag.includes(query)).length;
      return { item, score };
    })
    .sort((left, right) => right.score - left.score || left.item.item_id.localeCompare(right.item.item_id));

  const topK = Math.max(1, Math.min(input.top_k || 12, 24));
  return {
    catalog: input.catalog,
    total_available: items.length,
    variant_capacity: items.length * 10,
    items: scored.slice(0, topK).map(entry => entry.item),
  };
}

function findCatalogItem(catalog: CatalogKind, itemId: string): CatalogItem {
  const item = generateCatalog(catalog).find(entry => entry.item_id === itemId);
  if (!item) {
    throw new Error(`Catalog item not found: ${itemId}`);
  }
  return item;
}

export function generateVariants(input: {
  catalog: CatalogKind;
  base_item_id: string;
  direction: 'more_like_this' | 'different_direction';
  count?: number;
}): VariantGenerationResult {
  const baseItem = findCatalogItem(input.catalog, input.base_item_id);
  const count = Math.max(1, Math.min(input.count || 12, 24));
  const families = catalogFamilies[input.catalog];
  const variants: CatalogItem[] = [];

  for (let index = 0; index < count; index += 1) {
    const family = input.direction === 'more_like_this'
      ? baseItem.family
      : families[(families.indexOf(baseItem.family) + index + 1) % families.length];
    const seed = parseInt(createHash('sha256').update(`${baseItem.item_id}:${input.direction}:${index}`).digest('hex').slice(0, 8), 16);
    variants.push({
      ...baseItem,
      item_id: `${baseItem.item_id}-variant-${input.direction}-${index + 1}`,
      family,
      title: `${family}-${input.catalog}-variant-${index + 1}`,
      params: {
        spacing_scale: baseItem.params.spacing_scale + ((seed % 3) * 0.05),
        corner_radius: baseItem.params.corner_radius + (seed % 4),
        stroke_width: Math.max(1, baseItem.params.stroke_width + (seed % 2)),
        shadow_depth: (baseItem.params.shadow_depth + index + 1) % 8,
        palette_mapping: `palette-${(seed % 12) + 1}`,
        typography_scale: baseItem.params.typography_scale + ((index % 4) * 0.05),
        rtl_mirroring: baseItem.rtl_ready,
      },
    });
  }

  return {
    base_item_id: baseItem.item_id,
    direction: input.direction,
    variants,
  };
}
