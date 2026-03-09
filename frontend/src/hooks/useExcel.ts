'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';

interface FormulaResult {
  value: unknown;
  type: string;
  error?: string;
}

interface MonteCarloResult {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  percentile5: number;
  percentile95: number;
  median: number;
  histogram: Array<{ binStart: number; binEnd: number; count: number }>;
}

interface MonteCarloVariable {
  cellRef: string;
  distribution: 'normal' | 'uniform' | 'triangular' | 'lognormal';
  params: Record<string, number>;
}

interface FormulaCategory {
  name: string;
  functions: Array<{ name: string; description: string; syntax: string }>;
}

interface FormattingRule {
  id: string;
  range: string;
  condition: string;
  format: {
    backgroundColor?: string;
    textColor?: string;
    bold?: boolean;
    italic?: boolean;
    numberFormat?: string;
  };
}

export function useExcel() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<FormulaCategory[]>([]);
  const [formattingRules, setFormattingRules] = useState<FormattingRule[]>([]);

  const evaluateFormula = useCallback(async (
    formula: string,
    context?: Record<string, unknown>
  ): Promise<FormulaResult> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<{ data: FormulaResult }>('/api/v1/excel/formula/evaluate', { formula, context });
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Formula evaluation failed';
      setError(msg);
      return { value: null, type: 'error', error: msg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runMonteCarlo = useCallback(async (
    iterations: number,
    variables: MonteCarloVariable[],
    outputFormula: string
  ): Promise<MonteCarloResult | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<{ data: MonteCarloResult }>('/api/v1/excel/monte-carlo', {
        iterations,
        variables,
        outputFormula,
      });
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Monte Carlo simulation failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const listFormulaCategories = useCallback(async (): Promise<FormulaCategory[]> => {
    try {
      const res = await api.get<{ data: FormulaCategory[] }>('/api/v1/excel/formula/categories');
      setCategories(res.data);
      return res.data;
    } catch {
      return [];
    }
  }, []);

  const loadFormattingRules = useCallback(async (fileId: string, sheetName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: FormattingRule[] }>(`/api/v1/excel/${fileId}/formatting?sheet=${encodeURIComponent(sheetName)}`);
      setFormattingRules(res.data);
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load formatting rules');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyFormatting = useCallback(async (fileId: string, sheetName: string, rules: Array<Omit<FormattingRule, 'id'>>) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<{ data: FormattingRule[] }>(`/api/v1/excel/${fileId}/formatting`, { sheetName, rules });
      setFormattingRules(res.data);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to apply formatting';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeFormatting = useCallback(async (fileId: string, ruleId: string) => {
    await api.del(`/api/v1/excel/${fileId}/formatting/${ruleId}`);
    setFormattingRules(prev => prev.filter(r => r.id !== ruleId));
  }, []);

  useEffect(() => { listFormulaCategories(); }, [listFormulaCategories]);

  return {
    evaluateFormula,
    runMonteCarlo,
    listFormulaCategories,
    categories,
    formattingRules,
    loadFormattingRules,
    applyFormatting,
    removeFormatting,
    isLoading,
    error,
  };
}
