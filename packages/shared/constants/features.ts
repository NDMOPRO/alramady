/**
 * RASID Platform - Feature ID Constants
 *
 * Maps feature ID ranges (F-XXXXXX format) to their respective engines.
 * Total: 5,412 features across 13 engines.
 */

import { Engine } from '../types/engine-types';

// ---------------------------------------------------------------------------
// Feature range per engine
// ---------------------------------------------------------------------------

export interface FeatureRange {
  engine: Engine;
  startId: string;
  endId: string;
  startNum: number;
  endNum: number;
  count: number;
  description: string;
}

/**
 * Feature ID ranges assigned to each engine, in sequential order.
 * Each engine owns a contiguous block of feature IDs.
 */
export const ENGINE_FEATURE_RANGES: FeatureRange[] = [
  {
    engine: Engine.DATA,
    startId: 'F-000001',
    endId: 'F-001259',
    startNum: 1,
    endNum: 1259,
    count: 1259,
    description: 'Data Engine features: ingestion, parsing, cleansing, transformation, merging, export, visualization, search, versioning',
  },
  {
    engine: Engine.EXCEL,
    startId: 'F-001260',
    endId: 'F-001592',
    startNum: 1260,
    endNum: 1592,
    count: 333,
    description: 'Excel Engine features: spreadsheet core, formula engine, pivot tables, export',
  },
  {
    engine: Engine.DASHBOARD,
    startId: 'F-001593',
    endId: 'F-002037',
    startNum: 1593,
    endNum: 2037,
    count: 445,
    description: 'Dashboard Engine features: builder, widgets, charts, filters, live updates, image-to-dashboard, export, sharing',
  },
  {
    engine: Engine.REPORTING,
    startId: 'F-002038',
    endId: 'F-002528',
    startNum: 2038,
    endNum: 2528,
    count: 491,
    description: 'Reporting Engine features: builder, scheduler, templates, export, periodic reports, distribution',
  },
  {
    engine: Engine.PRESENTATION,
    startId: 'F-002529',
    endId: 'F-003553',
    startNum: 2529,
    endNum: 3553,
    count: 1025,
    description: 'Presentation Engine features: slide editor, templates, animations, AI generation, media, themes, export, transitions',
  },
  {
    engine: Engine.INFOGRAPHIC,
    startId: 'F-003554',
    endId: 'F-003707',
    startNum: 3554,
    endNum: 3707,
    count: 154,
    description: 'Infographic Engine features: builder, visual hierarchy',
  },
  {
    engine: Engine.REPLICATION,
    startId: 'F-003708',
    endId: 'F-003844',
    startNum: 3708,
    endNum: 3844,
    count: 137,
    description: 'Replication Engine features: pixel matching, structural analysis, layout comparison, font/color/spacing matching, fingerprinting, verification',
  },
  {
    engine: Engine.LOCALIZATION,
    startId: 'F-003845',
    endId: 'F-004081',
    startNum: 3845,
    endNum: 4081,
    count: 237,
    description: 'Localization Engine features: RTL transformation, Arabic typography, cultural formatting, translation, bidi layout, font management',
  },
  {
    engine: Engine.AI,
    startId: 'F-004082',
    endId: 'F-004629',
    startNum: 4082,
    endNum: 4629,
    count: 548,
    description: 'AI Engine features: free interrogation, analysis, recommendations, NLP, orchestration, agents',
  },
  {
    engine: Engine.GOVERNANCE,
    startId: 'F-004630',
    endId: 'F-005217',
    startNum: 4630,
    endNum: 5217,
    count: 588,
    description: 'Governance Engine features: user/role/permission management, audit, teams, workflows, notifications, integrations, policies, compliance',
  },
  {
    engine: Engine.LIBRARY,
    startId: 'F-005218',
    endId: 'F-005270',
    startNum: 5218,
    endNum: 5270,
    count: 53,
    description: 'Library Engine features: asset management',
  },
  {
    engine: Engine.TEMPLATE,
    startId: 'F-005271',
    endId: 'F-005370',
    startNum: 5271,
    endNum: 5370,
    count: 100,
    description: 'Template Engine features: template management',
  },
  {
    engine: Engine.CONVERSION,
    startId: 'F-005371',
    endId: 'F-005412',
    startNum: 5371,
    endNum: 5412,
    count: 42,
    description: 'Conversion Engine features: format detection, document/image/data conversion',
  },
];

// ---------------------------------------------------------------------------
// Total counts
// ---------------------------------------------------------------------------

export const FEATURE_ID_MIN = 'F-000001';
export const FEATURE_ID_MAX = 'F-005412';
export const TOTAL_FEATURE_COUNT = 5412;

// ---------------------------------------------------------------------------
// Feature ID utilities
// ---------------------------------------------------------------------------

/**
 * Generate a zero-padded feature ID from a numeric index.
 * Example: generateFeatureId(42) => "F-000042"
 */
export function generateFeatureId(num: number): string {
  if (num < 1 || num > TOTAL_FEATURE_COUNT) {
    throw new Error(
      `Feature number ${num} is out of range. Must be between 1 and ${TOTAL_FEATURE_COUNT}.`
    );
  }
  return `F-${String(num).padStart(6, '0')}`;
}

/**
 * Parse a feature ID string back to its numeric index.
 * Example: parseFeatureId("F-000042") => 42
 */
export function parseFeatureId(id: string): number {
  const match = /^F-(\d{6})$/.exec(id);
  if (!match) {
    throw new Error(`Invalid feature ID format: "${id}". Expected format: F-XXXXXX`);
  }
  const num = parseInt(match[1], 10);
  if (num < 1 || num > TOTAL_FEATURE_COUNT) {
    throw new Error(
      `Feature ID ${id} (${num}) is out of range. Must be between 1 and ${TOTAL_FEATURE_COUNT}.`
    );
  }
  return num;
}

/**
 * Validate whether a string is a well-formed feature ID within range.
 */
export function isValidFeatureId(id: string): boolean {
  const match = /^F-(\d{6})$/.exec(id);
  if (!match) {
    return false;
  }
  const num = parseInt(match[1], 10);
  return num >= 1 && num <= TOTAL_FEATURE_COUNT;
}

/**
 * Determine which engine a feature ID belongs to based on its numeric range.
 * Returns the Engine enum value, or undefined if not found.
 */
export function getEngineForFeature(featureId: string): Engine | undefined {
  const num = (() => {
    try {
      return parseFeatureId(featureId);
    } catch {
      return -1;
    }
  })();
  if (num < 1) {
    return undefined;
  }
  for (const range of ENGINE_FEATURE_RANGES) {
    if (num >= range.startNum && num <= range.endNum) {
      return range.engine;
    }
  }
  return undefined;
}

/**
 * Get the feature range definition for a given engine.
 */
export function getFeatureRangeForEngine(engine: Engine): FeatureRange | undefined {
  for (const range of ENGINE_FEATURE_RANGES) {
    if (range.engine === engine) {
      return range;
    }
  }
  return undefined;
}

/**
 * Generate all feature IDs for a given engine.
 */
export function getFeatureIdsForEngine(engine: Engine): string[] {
  const range = getFeatureRangeForEngine(engine);
  if (!range) {
    return [];
  }
  const ids: string[] = [];
  for (let i = range.startNum; i <= range.endNum; i++) {
    ids.push(`F-${String(i).padStart(6, '0')}`);
  }
  return ids;
}

/**
 * Verify that all feature ranges are contiguous and sum to the total.
 */
export function verifyFeatureRanges(): {
  valid: boolean;
  totalFromRanges: number;
  expectedTotal: number;
  gaps: string[];
} {
  let totalFromRanges = 0;
  const gaps: string[] = [];
  let previousEnd = 0;

  for (const range of ENGINE_FEATURE_RANGES) {
    if (range.startNum !== previousEnd + 1) {
      gaps.push(
        `Gap between ${previousEnd} and ${range.startNum} (engine: ${range.engine})`
      );
    }
    totalFromRanges += range.count;
    const expectedCount = range.endNum - range.startNum + 1;
    if (expectedCount !== range.count) {
      gaps.push(
        `Count mismatch for ${range.engine}: declared ${range.count}, computed ${expectedCount}`
      );
    }
    previousEnd = range.endNum;
  }

  return {
    valid: totalFromRanges === TOTAL_FEATURE_COUNT && gaps.length === 0,
    totalFromRanges,
    expectedTotal: TOTAL_FEATURE_COUNT,
    gaps,
  };
}
