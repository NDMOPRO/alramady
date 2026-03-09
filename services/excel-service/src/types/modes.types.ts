export type ModeName = 'easy' | 'advanced' | 'auto';

export type DetailLevel = 'minimal' | 'standard' | 'detailed' | 'full';

export interface ModeFeature {
  id: string;
  name: string;
  description: string;
  category: string;
  availableIn: ModeName[];
  enabled: boolean;
}

export interface ModeDetectionResult {
  recommendedMode: ModeName;
  confidence: number;
  reasons: string[];
  fileComplexity: FileComplexity;
}

export interface FileComplexity {
  formulaCount: number;
  uniqueFunctionCount: number;
  sheetCount: number;
  chartCount: number;
  pivotTableCount: number;
  conditionalFormatCount: number;
  macroCount: number;
  score: number;
  level: 'simple' | 'moderate' | 'complex' | 'expert';
}

export interface DragDropOperation {
  type: 'sheet' | 'column' | 'row';
  sourceIndex: number;
  targetIndex: number;
  sheet?: string;
}

export interface ModeConfig {
  currentMode: ModeName;
  detailLevel: DetailLevel;
  easy: {
    enabledFeatures: string[];
    toolbarLayout: { simplified: boolean; groupCount: number };
    ribbonConfig: { compact: boolean };
    shortcutsEnabled: boolean;
    autoSave: boolean;
    autoSaveInterval: number;
  };
  advanced: {
    enabledFeatures: string[];
    toolbarLayout: { simplified: boolean; groupCount: number };
    ribbonConfig: { compact: boolean; customTabs: boolean };
    shortcutsEnabled: boolean;
    autoSave: boolean;
    autoSaveInterval: number;
  };
  lastSwitchedAt?: string;
}
